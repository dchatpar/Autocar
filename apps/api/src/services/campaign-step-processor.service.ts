/**
 * Campaign Step Processor — executes one CampaignStep for one
 * CampaignEnrollment, persists a `CampaignStepExecution` row, and
 * advances the enrollment cursor to the next step (or marks it
 * COMPLETED / EXITED / FAILED).
 *
 * Multi-tenant: every Prisma call is scoped by `dealerId` (the
 * first arg). The worker is the only entry point that should call
 * `processOne` directly; the route layer and the trigger service
 * enqueue jobs onto the BullMQ step queue.
 *
 * Step types handled here:
 *   EMAIL       → SendGrid send + Communication row
 *   SMS         → Twilio send + Communication row
 *   WAIT        → advance cursor + schedule the next step at +N hours
 *   BRANCH      → evaluate predicate, jump to thenStep/elseStep
 *   WEBHOOK     → POST to external URL with enrollment payload
 *   TASK        → create an internal task (Activity row)
 *   EXIT        → mark enrollment EXITED
 *
 * Side-effects:
 *   - Updates `CampaignEnrollment.currentStepOrder`, `nextRunAt`,
 *     status, counters.
 *   - Updates `Campaign.enrolledCount` / `activeCount` / etc.
 *   - Writes `Communication` rows for EMAIL/SMS so the timeline
 *     sees them.
 *   - Writes `Activity` rows for TASK and the milestone transitions
 *     (started, completed, exited, failed).
 *
 * Idempotency:
 *   - Each (enrollmentId, stepId) execution gets a fresh
 *     `CampaignStepExecution` row. Re-runs increment `attempts` and
 *     fail the step after `MAX_ATTEMPTS` (3 by default).
 */

import { prisma } from "../utils/prisma.js";
import { sendGridClient } from "../integrations/email/sendgrid.client.js";
import { twilioClient } from "../integrations/sms/twilio.client.js";
import { ValidationError } from "../utils/errors.js";
import {
  buildContextFromEnrollment,
  hasUnsubscribeFooter,
  renderTemplate,
} from "../utils/campaign-template.js";
import { campaignQueue } from "../queues/campaign.queue.js";

const MAX_ATTEMPTS = 3;
const WEBHOOK_TIMEOUT_MS = 10_000;

export interface ProcessResult {
  status: "advanced" | "completed" | "exited" | "failed" | "skipped";
  nextStepId: string | null;
  nextRunAt: string | null;
  message: string;
}

/* ============================================================
 * Logger
 * ============================================================ */

function log(
  level: "info" | "warn" | "error",
  obj: Record<string, unknown>,
  msg?: string,
): void {
  // eslint-disable-next-line no-console
  const stream = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  stream(
    JSON.stringify({
      level,
      component: "campaign-step-processor.service",
      ...obj,
      msg,
    }),
  );
}

/* ============================================================
 * Public entry
 * ============================================================ */

export const campaignStepProcessor = {
  /**
   * Process one step for one enrollment. Idempotent: a successful
   * prior run is a no-op; a failed prior run is retried up to
   * MAX_ATTEMPTS.
   */
  async processOne(
    dealerId: string,
    enrollmentId: string,
    stepId: string,
  ): Promise<ProcessResult> {
    // Load the enrollment with its campaign + step.
    const enrollmentRaw = await prisma.campaignEnrollment.findFirst({
      where: { dealerId, id: enrollmentId },
      include: {
        campaign: { include: { steps: { orderBy: { order: "asc" } } } },
        lead: {
          include: {
            assignedTo: { select: { name: true, email: true } },
          },
        },
        customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    });
    // Cast to the lightweight shape we need downstream. The Prisma
    // GetPayload type pulls in the full User for `assignedTo` which
    // we don't actually need.
    const enrollment = enrollmentRaw as unknown as EnrollmentSubject | null;
    if (!enrollment) {
      log("warn", { dealerId, enrollmentId }, "enrollment not found");
      return { status: "skipped", nextStepId: null, nextRunAt: null, message: "Enrollment not found" };
    }
    if (enrollment.status === "COMPLETED" || enrollment.status === "EXITED" || enrollment.status === "FAILED") {
      log("info", { dealerId, enrollmentId, status: enrollment.status }, "enrollment terminal; skip");
      return { status: "skipped", nextStepId: null, nextRunAt: null, message: "Enrollment is terminal" };
    }

    const step = enrollment.campaign.steps.find((s) => s.id === stepId);
    if (!step) {
      log("warn", { dealerId, enrollmentId, stepId }, "step not found in campaign");
      return { status: "skipped", nextStepId: null, nextRunAt: null, message: "Step not found" };
    }
    if (step.order !== enrollment.currentStepOrder) {
      // Out-of-order run — likely a re-enqueue from a previous attempt.
      // Log and continue; the cursor will catch up.
      log("info", { dealerId, enrollmentId, stepOrder: step.order, cursor: enrollment.currentStepOrder }, "step order mismatch — re-aligning");
    }

    // Has a successful execution already been recorded for this step?
    const priorSuccess = await prisma.campaignStepExecution.findFirst({
      where: {
        enrollmentId,
        stepId,
        status: { in: ["SENT", "DELIVERED", "SKIPPED"] },
      },
      select: { id: true },
    });
    if (priorSuccess) {
      log("info", { dealerId, enrollmentId, stepId }, "step already executed — skip");
      return { status: "skipped", nextStepId: null, nextRunAt: null, message: "Step already executed" };
    }

    // Skip-weekend check (WAIT is the main user).
    if (step.skipWeekends && isWeekend(new Date())) {
      const nextRun = nextWeekday(new Date());
      await recordExecution({
        dealerId,
        enrollmentId,
        step,
        status: "SKIPPED",
        renderedBody: null,
        renderedSubject: null,
        errorMessage: "Skipped due to skipWeekends flag",
      });
      return await advanceAfterSkip(dealerId, enrollment, step, nextRun);
    }

    // Open an execution row (RUNNING).
    const execution = await prisma.campaignStepExecution.create({
      data: {
        dealerId,
        enrollmentId,
        stepId: step.id,
        stepOrder: step.order,
        stepType: step.stepType as
          | "EMAIL"
          | "SMS"
          | "WAIT"
          | "BRANCH"
          | "WEBHOOK"
          | "TASK"
          | "EXIT",
        status: "RUNNING",
        startedAt: new Date(),
        attempts: 1,
      },
      select: { id: true, startedAt: true },
    });

    try {
      const result = await executeStep(dealerId, enrollment, step, execution.id);
      await prisma.campaignStepExecution.update({
        where: { id: execution.id },
        data: {
          status: result.executionStatus,
          externalId: result.externalId ?? null,
          errorMessage: result.errorMessage ?? null,
          durationMs: result.durationMs,
          renderedBody: result.renderedBody ?? null,
          renderedSubject: result.renderedSubject ?? null,
          completedAt: new Date(),
        },
      });

      if (result.executionStatus === "FAILED") {
        // Bump attempt count + maybe retry.
        const attemptCount = enrollment.attemptCount + 1;
        if (attemptCount >= MAX_ATTEMPTS) {
          await markEnrollmentFailed(dealerId, enrollment.id, result.errorMessage ?? "Step failed");
          return { status: "failed", nextStepId: null, nextRunAt: null, message: result.errorMessage ?? "Step failed" };
        }
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: {
            attemptCount,
            lastError: result.errorMessage ?? "Step failed",
            status: "PENDING",
            nextRunAt: new Date(Date.now() + 5 * 60_000), // 5 min
          },
        });
        // Re-enqueue.
        await campaignQueue.enqueueStep(
          { dealerId, enrollmentId: enrollment.id, stepId: step.id, isRetry: true },
          { delay: 5 * 60_000 },
        );
        return {
          status: "failed",
          nextStepId: step.id,
          nextRunAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          message: result.errorMessage ?? "Step failed (retrying)",
        };
      }

      // Success path — advance.
      return await advanceAfterSuccess(dealerId, enrollment, step);
    } catch (err) {
      // Unexpected error — log + persist + retry.
      const message = err instanceof Error ? err.message : String(err);
      log("error", { dealerId, enrollmentId, stepId, err: message }, "executeStep threw");
      await prisma.campaignStepExecution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          errorMessage: message,
          durationMs: Date.now() - execution.startedAt.getTime(),
          completedAt: new Date(),
        },
      });
      const attemptCount = enrollment.attemptCount + 1;
      if (attemptCount >= MAX_ATTEMPTS) {
        await markEnrollmentFailed(dealerId, enrollment.id, message);
        return { status: "failed", nextStepId: null, nextRunAt: null, message };
      }
      await prisma.campaignEnrollment.update({
        where: { id: enrollment.id },
        data: {
          attemptCount,
          lastError: message,
          status: "PENDING",
          nextRunAt: new Date(Date.now() + 5 * 60_000),
        },
      });
      await campaignQueue.enqueueStep(
        { dealerId, enrollmentId: enrollment.id, stepId: step.id, isRetry: true },
        { delay: 5 * 60_000 },
      );
      return {
        status: "failed",
        nextStepId: step.id,
        nextRunAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        message,
      };
    }
  },
};

/* ============================================================
 * Execute one step — switch on stepType
 * ============================================================ */

interface ExecuteOutcome {
  executionStatus: "SENT" | "DELIVERED" | "SKIPPED" | "FAILED";
  externalId: string | null;
  errorMessage: string | null;
  durationMs: number;
  renderedBody: string | null;
  renderedSubject: string | null;
}

/**
 * Lightweight subject type that the step executors and helpers
 * actually need. Avoids fighting Prisma's `GetPayload` inference
 * (which pulls in the full User model for `assignedTo`).
 */
interface EnrollmentSubject {
  id: string;
  campaignId: string;
  leadId: string | null;
  customerId: string | null;
  currentStepOrder: number;
  status: string;
  attemptCount: number;
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    source: string | null;
    status: string;
    currentScore: number;
    classification: string;
    vehicleInterest: unknown;
    createdAt: Date;
    lastContactedAt: Date | null;
    customerId: string | null;
    assignedToId: string | null;
    assignedTo: { name: string; email: string } | null;
  } | null;
  customer: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  } | null;
  campaign: {
    id: string;
    name: string;
    steps: Array<{
      id: string;
      order: number;
      name: string;
      stepType: string;
      subject: string | null;
      template: string | null;
      waitHours: number | null;
      branchConfig: unknown;
      webhookUrl: string | null;
      webhookMethod: string | null;
      fromAddress: string | null;
      skipWeekends: boolean;
      taskAssignToId: string | null;
      metadata: unknown;
    }>;
  };
}

async function executeStep(
  dealerId: string,
  enrollment: EnrollmentSubject,
  step: EnrollmentSubject["campaign"]["steps"][number],
  executionId: string,
): Promise<ExecuteOutcome> {
  const startedAt = Date.now();
  const ctx = await buildContextFromEnrollment({
    dealerId,
    lead: enrollment.lead
      ? {
          firstName: enrollment.lead.firstName,
          lastName: enrollment.lead.lastName,
          email: enrollment.lead.email,
          phone: enrollment.lead.phone,
          assignedTo: enrollment.lead.assignedTo,
        }
      : null,
    customer: enrollment.customer,
  });

  switch (step.stepType) {
    case "EMAIL":
      return runEmailStep(dealerId, enrollment, step, ctx, startedAt);
    case "SMS":
      return runSmsStep(dealerId, enrollment, step, ctx, startedAt);
    case "WAIT":
      // No-op — the cursor advance handles the wait.
      return {
        executionStatus: "SKIPPED",
        externalId: null,
        errorMessage: null,
        durationMs: Date.now() - startedAt,
        renderedBody: null,
        renderedSubject: null,
      };
    case "BRANCH":
      return {
        executionStatus: "SKIPPED",
        externalId: null,
        errorMessage: null,
        durationMs: Date.now() - startedAt,
        renderedBody: null,
        renderedSubject: null,
      };
    case "WEBHOOK":
      return runWebhookStep(enrollment, step, ctx, startedAt);
    case "TASK":
      return runTaskStep(dealerId, enrollment, step, ctx, startedAt);
    case "EXIT":
      return {
        executionStatus: "SKIPPED",
        externalId: null,
        errorMessage: null,
        durationMs: Date.now() - startedAt,
        renderedBody: null,
        renderedSubject: null,
      };
    default: {
      // Exhaustiveness guard.
      const _exhaustive: never = step.stepType as never;
      void _exhaustive;
      void executionId;
      throw new ValidationError(`Unknown step type: ${String(step.stepType)}`);
    }
  }
}

/* ============================================================
 * Per-step implementations
 * ============================================================ */

async function runEmailStep(
  dealerId: string,
  enrollment: EnrollmentSubject,
  step: EnrollmentSubject["campaign"]["steps"][number],
  ctx: Awaited<ReturnType<typeof buildContextFromEnrollment>>,
  startedAt: number,
): Promise<ExecuteOutcome> {
  if (!ctx.email) {
    return {
      executionStatus: "SKIPPED",
      externalId: null,
      errorMessage: "Recipient has no email address",
      durationMs: Date.now() - startedAt,
      renderedBody: null,
      renderedSubject: null,
    };
  }
  if (!step.subject || !step.template) {
    return {
      executionStatus: "FAILED",
      externalId: null,
      errorMessage: "EMAIL step is missing subject or template",
      durationMs: Date.now() - startedAt,
      renderedBody: null,
      renderedSubject: null,
    };
  }
  if (!hasUnsubscribeFooter(step.template) && !hasUnsubscribeFooter(step.subject)) {
    log("warn", { dealerId, enrollmentId: enrollment.id, stepId: step.id }, "EMAIL step is missing {{unsubscribe_url}} footer — CAN-SPAM risk");
  }

  const subjectResult = renderTemplate(step.subject, ctx);
  const bodyResult = renderTemplate(step.template, ctx);

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { settings: true },
  });
  const settings =
    dealer?.settings && typeof dealer.settings === "object"
      ? (dealer.settings as Record<string, unknown>)
      : {};

  const sendResult = await sendGridClient.sendEmail(settings, {
    to: ctx.email,
    toName: fullNameFromContext(ctx) ?? undefined,
    subject: subjectResult.text,
    text: bodyResult.text,
    categories: ["campaign", `campaign:${enrollment.campaignId}`],
    customArgs: {
      enrollmentId: enrollment.id,
      campaignId: enrollment.campaignId,
      stepId: step.id,
    },
    ...(step.fromAddress ? { from: { email: step.fromAddress } } : {}),
  });

  // Persist a Communication row so the timeline sees the email.
  await prisma.communication.create({
    data: {
      dealerId,
      leadId: enrollment.leadId ?? null,
      customerId: enrollment.customerId ?? null,
      channel: "EMAIL",
      direction: "OUTBOUND",
      toAddr: ctx.email,
      subject: subjectResult.text,
      body: bodyResult.text,
      status: sendResult.dev ? "PENDING" : "SENT",
      externalId: sendResult.messageId,
      aiGenerated: false,
      sentAt: new Date(),
    },
  });

  return {
    executionStatus: sendResult.dev ? "SENT" : "SENT",
    externalId: sendResult.messageId,
    errorMessage: null,
    durationMs: Date.now() - startedAt,
    renderedBody: bodyResult.text,
    renderedSubject: subjectResult.text,
  };
}

async function runSmsStep(
  dealerId: string,
  enrollment: EnrollmentSubject,
  step: EnrollmentSubject["campaign"]["steps"][number],
  ctx: Awaited<ReturnType<typeof buildContextFromEnrollment>>,
  startedAt: number,
): Promise<ExecuteOutcome> {
  if (!ctx.phone) {
    return {
      executionStatus: "SKIPPED",
      externalId: null,
      errorMessage: "Recipient has no phone number",
      durationMs: Date.now() - startedAt,
      renderedBody: null,
      renderedSubject: null,
    };
  }
  if (!step.template) {
    return {
      executionStatus: "FAILED",
      externalId: null,
      errorMessage: "SMS step is missing template body",
      durationMs: Date.now() - startedAt,
      renderedBody: null,
      renderedSubject: null,
    };
  }
  const bodyResult = renderTemplate(step.template, ctx);

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { settings: true },
  });
  const settings =
    dealer?.settings && typeof dealer.settings === "object"
      ? (dealer.settings as Record<string, unknown>)
      : {};

  const sendResult = await twilioClient.sendSms(settings, {
    to: ctx.phone,
    body: bodyResult.text,
    statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL,
  });

  await prisma.communication.create({
    data: {
      dealerId,
      leadId: enrollment.leadId ?? null,
      customerId: enrollment.customerId ?? null,
      channel: "SMS",
      direction: "OUTBOUND",
      toAddr: ctx.phone,
      body: bodyResult.text,
      status: sendResult.dev ? "PENDING" : "SENT",
      externalId: sendResult.messageSid,
      aiGenerated: false,
      sentAt: new Date(),
    },
  });

  return {
    executionStatus: "SENT",
    externalId: sendResult.messageSid,
    errorMessage: null,
    durationMs: Date.now() - startedAt,
    renderedBody: bodyResult.text,
    renderedSubject: null,
  };
}

async function runWebhookStep(
  enrollment: EnrollmentSubject,
  step: EnrollmentSubject["campaign"]["steps"][number],
  ctx: Awaited<ReturnType<typeof buildContextFromEnrollment>>,
  startedAt: number,
): Promise<ExecuteOutcome> {
  if (!step.webhookUrl) {
    return {
      executionStatus: "FAILED",
      externalId: null,
      errorMessage: "WEBHOOK step is missing webhookUrl",
      durationMs: Date.now() - startedAt,
      renderedBody: null,
      renderedSubject: null,
    };
  }
  const body = step.template
    ? renderTemplate(step.template, ctx).text
    : JSON.stringify({
        enrollmentId: enrollment.id,
        campaignId: enrollment.campaignId,
        leadId: enrollment.leadId,
        customerId: enrollment.customerId,
        currentStepOrder: enrollment.currentStepOrder,
        status: enrollment.status,
      });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(step.webhookUrl, {
      method: step.webhookMethod ?? "POST",
      headers: {
        "Content-Type":
          step.webhookMethod === "GET" ? "application/json" : "application/json",
        "User-Agent": "DealerOS-Campaigns/1.0",
      },
      body: step.webhookMethod === "GET" ? undefined : body,
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        executionStatus: "FAILED",
        externalId: null,
        errorMessage: `Webhook ${response.status} ${response.statusText}`,
        durationMs: Date.now() - startedAt,
        renderedBody: body,
        renderedSubject: null,
      };
    }
    return {
      executionStatus: "SENT",
      externalId: response.headers.get("x-request-id"),
      errorMessage: null,
      durationMs: Date.now() - startedAt,
      renderedBody: body,
      renderedSubject: null,
    };
  } catch (err) {
    return {
      executionStatus: "FAILED",
      externalId: null,
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
      renderedBody: body,
      renderedSubject: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runTaskStep(
  dealerId: string,
  enrollment: EnrollmentSubject,
  step: EnrollmentSubject["campaign"]["steps"][number],
  ctx: Awaited<ReturnType<typeof buildContextFromEnrollment>>,
  startedAt: number,
): Promise<ExecuteOutcome> {
  if (!step.template) {
    return {
      executionStatus: "FAILED",
      externalId: null,
      errorMessage: "TASK step is missing template body",
      durationMs: Date.now() - startedAt,
      renderedBody: null,
      renderedSubject: null,
    };
  }
  const bodyResult = renderTemplate(step.template, ctx);
  const subjectResult = step.subject ? renderTemplate(step.subject, ctx) : { text: "Follow up" };

  const assignedToId = step.taskAssignToId ?? enrollment.lead?.assignedToId ?? null;

  await prisma.activity.create({
    data: {
      dealerId,
      entityType: "LEAD",
      entityId: enrollment.leadId ?? enrollment.customerId ?? "",
      type: "AI_ACTION",
      body: bodyResult.text,
      metadata: {
        kind: "campaign_task",
        campaignId: enrollment.campaignId,
        enrollmentId: enrollment.id,
        subject: subjectResult.text,
        assignedToId,
      },
    },
  });

  return {
    executionStatus: "SENT",
    externalId: null,
    errorMessage: null,
    durationMs: Date.now() - startedAt,
    renderedBody: bodyResult.text,
    renderedSubject: subjectResult.text,
  };
}

/* ============================================================
 * Cursor advance — move the enrollment to the next step
 * ============================================================ */

async function advanceAfterSuccess(
  dealerId: string,
  enrollment: EnrollmentSubject,
  step: EnrollmentSubject["campaign"]["steps"][number],
): Promise<ProcessResult> {
  const totalSteps = enrollment.campaign.steps.length;
  const isLast = step.order === totalSteps - 1;

  // Branch decision.
  let nextOrder = step.order + 1;
  if (step.stepType === "BRANCH" && step.branchConfig) {
    const cfg = step.branchConfig as {
      field: string;
      op: string;
      value?: string | number | boolean;
      thenStep: number;
      elseStep: number;
    };
    const cond = evaluateBranch(cfg, enrollment);
    nextOrder = cond ? cfg.thenStep : cfg.elseStep;
  }

  if (isLast || step.stepType === "EXIT" || nextOrder >= totalSteps) {
    await markEnrollmentCompleted(dealerId, enrollment.id);
    return {
      status: "completed",
      nextStepId: null,
      nextRunAt: null,
      message: "Enrollment completed",
    };
  }

  const nextStep = enrollment.campaign.steps.find((s) => s.order === nextOrder);
  if (!nextStep) {
    await markEnrollmentCompleted(dealerId, enrollment.id);
    return {
      status: "completed",
      nextStepId: null,
      nextRunAt: null,
      message: "Next step not found — completed",
    };
  }

  // Compute nextRunAt — WAIT steps add their waitHours.
  let nextRunAt: Date;
  if (nextStep.stepType === "WAIT") {
    const hours = nextStep.waitHours ?? 0;
    nextRunAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  } else {
    // Email/SMS/etc — schedule for "right now" + small jitter.
    nextRunAt = new Date(Date.now() + 5_000);
  }

  await prisma.campaignEnrollment.update({
    where: { id: enrollment.id },
    data: {
      currentStepOrder: nextStep.order,
      nextRunAt,
      status: "ACTIVE",
      lastError: null,
      stepsExecuted: { increment: 1 },
      ...(step.stepType === "EMAIL" ? { emailsSent: { increment: 1 } } : {}),
      ...(step.stepType === "SMS" ? { smsSent: { increment: 1 } } : {}),
    },
  });

  // Enqueue the next step.
  const delay = Math.max(0, nextRunAt.getTime() - Date.now());
  await campaignQueue.enqueueStep(
    {
      dealerId,
      enrollmentId: enrollment.id,
      stepId: nextStep.id,
      scheduledFor: nextRunAt.getTime(),
    },
    { delay },
  );

  return {
    status: "advanced",
    nextStepId: nextStep.id,
    nextRunAt: nextRunAt.toISOString(),
    message: `Advanced to step ${nextStep.order + 1}`,
  };
}

async function advanceAfterSkip(
  dealerId: string,
  enrollment: EnrollmentSubject,
  step: EnrollmentSubject["campaign"]["steps"][number],
  nextRun: Date,
): Promise<ProcessResult> {
  const nextStep = enrollment.campaign.steps.find((s) => s.order === step.order + 1);
  await prisma.campaignEnrollment.update({
    where: { id: enrollment.id },
    data: {
      nextRunAt: nextRun,
      status: "ACTIVE",
    },
  });
  if (!nextStep) {
    await markEnrollmentCompleted(dealerId, enrollment.id);
    return { status: "completed", nextStepId: null, nextRunAt: null, message: "Skipped last step" };
  }
  const delay = Math.max(0, nextRun.getTime() - Date.now());
  await campaignQueue.enqueueStep(
    { dealerId, enrollmentId: enrollment.id, stepId: nextStep.id, scheduledFor: nextRun.getTime() },
    { delay },
  );
  return {
    status: "advanced",
    nextStepId: nextStep.id,
    nextRunAt: nextRun.toISOString(),
    message: "Skipped weekend — advanced",
  };
}

/* ============================================================
 * Terminal state transitions
 * ============================================================ */

async function markEnrollmentCompleted(
  dealerId: string,
  enrollmentId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.campaignEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        nextRunAt: null,
      },
    });
    const enrollment = await tx.campaignEnrollment.findUnique({
      where: { id: enrollmentId },
      select: { campaignId: true },
    });
    if (enrollment) {
      await tx.campaign.update({
        where: { id: enrollment.campaignId },
        data: {
          completedCount: { increment: 1 },
          activeCount: { decrement: 1 },
        },
      });
    }
  });
  log("info", { dealerId, enrollmentId }, "enrollment completed");
}

async function markEnrollmentFailed(
  dealerId: string,
  enrollmentId: string,
  reason: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.campaignEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        lastError: reason,
        nextRunAt: null,
        stepsFailed: { increment: 1 },
      },
    });
    const enrollment = await tx.campaignEnrollment.findUnique({
      where: { id: enrollmentId },
      select: { campaignId: true },
    });
    if (enrollment) {
      await tx.campaign.update({
        where: { id: enrollment.campaignId },
        data: {
          failedCount: { increment: 1 },
          activeCount: { decrement: 1 },
        },
      });
    }
  });
  log("warn", { dealerId, enrollmentId, reason }, "enrollment failed");
}

/* ============================================================
 * Helpers
 * ============================================================ */

interface RecordExecutionInput {
  dealerId: string;
  enrollmentId: string;
  step: {
    id: string;
    order: number;
    stepType: string;
  };
  status: "PENDING" | "RUNNING" | "SENT" | "DELIVERED" | "SKIPPED" | "FAILED";
  renderedBody: string | null;
  renderedSubject: string | null;
  errorMessage: string | null;
}

async function recordExecution(input: RecordExecutionInput): Promise<void> {
  await prisma.campaignStepExecution.create({
    data: {
      dealerId: input.dealerId,
      enrollmentId: input.enrollmentId,
      stepId: input.step.id,
      stepOrder: input.step.order,
      stepType: input.step.stepType as
        | "EMAIL"
        | "SMS"
        | "WAIT"
        | "BRANCH"
        | "WEBHOOK"
        | "TASK"
        | "EXIT",
      status: input.status,
      errorMessage: input.errorMessage,
      renderedBody: input.renderedBody,
      renderedSubject: input.renderedSubject,
      attempts: 1,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
}

function evaluateBranch(
  cfg: {
    field: string;
    op: string;
    value?: string | number | boolean;
  },
  enrollment: EnrollmentSubject,
): boolean {
  // Build a flat key/value view of the enrollment subject.
  const subject: Record<string, unknown> = {};
  if (enrollment.lead) {
    subject.firstName = enrollment.lead.firstName;
    subject.lastName = enrollment.lead.lastName;
    subject.email = enrollment.lead.email;
    subject.phone = enrollment.lead.phone;
    subject.source = enrollment.lead.source;
    subject.status = enrollment.lead.status;
    subject.score = enrollment.lead.currentScore;
    subject.classification = enrollment.lead.classification;
  }
  if (enrollment.customer) {
    subject.customerFirstName = enrollment.customer.firstName;
    subject.customerLastName = enrollment.customer.lastName;
    subject.customerEmail = enrollment.customer.email;
    subject.customerPhone = enrollment.customer.phone;
  }
  const actual = subject[cfg.field];

  switch (cfg.op) {
    case "eq":
      return actual === cfg.value;
    case "neq":
      return actual !== cfg.value;
    case "gt":
      return typeof actual === "number" && typeof cfg.value === "number" && actual > cfg.value;
    case "gte":
      return typeof actual === "number" && typeof cfg.value === "number" && actual >= cfg.value;
    case "lt":
      return typeof actual === "number" && typeof cfg.value === "number" && actual < cfg.value;
    case "lte":
      return typeof actual === "number" && typeof cfg.value === "number" && actual <= cfg.value;
    case "contains":
      return typeof actual === "string" && typeof cfg.value === "string" && actual.toLowerCase().includes(cfg.value.toLowerCase());
    case "not_contains":
      return typeof actual === "string" && typeof cfg.value === "string" && !actual.toLowerCase().includes(cfg.value.toLowerCase());
    case "exists":
      return actual !== null && actual !== undefined && actual !== "";
    case "not_exists":
      return actual === null || actual === undefined || actual === "";
    default:
      return false;
  }
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function nextWeekday(d: Date): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + 1);
  while (isWeekend(out)) {
    out.setUTCDate(out.getUTCDate() + 1);
  }
  out.setUTCHours(9, 0, 0, 0);
  return out;
}

/* ============================================================
 * Augment TemplateContext — used by runEmailStep. We expose a
 * pure helper to compute the recipient's full name.
 * ============================================================ */

function fullNameFromContext(
  ctx: Awaited<ReturnType<typeof buildContextFromEnrollment>>,
): string | null {
  const first = ctx.firstName ?? ctx.customerFirstName ?? "";
  const last = ctx.lastName ?? ctx.customerLastName ?? "";
  const joined = `${first} ${last}`.trim();
  return joined.length > 0 ? joined : null;
}
