/**
 * Campaign Service — CRUD + lifecycle (activate, pause, archive) +
 * manual enrollment for the Marketing Campaigns module.
 *
 * Multi-tenant: every read/write carries `dealerId` (extracted from
 * the JWT in the route layer, passed in here).
 *
 * Responsibilities:
 *   - Create / read / update / list campaigns (and their nested steps)
 *   - Activate / pause / archive (state machine)
 *   - Manual enroll / unenroll of leads & customers
 *   - Stats aggregation
 *
 * Out of scope (handled by adjacent services):
 *   - Per-event matching   → campaign-trigger.service.ts
 *   - Per-step execution   → campaign-step-processor.service.ts
 *   - BullMQ wiring        → queues/campaign.queue.ts
 */

import type { Campaign, CampaignStep } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { campaignQueue } from "../queues/campaign.queue.js";
import { campaignTriggers } from "../services/campaign-trigger.service.js";
import {
  CreateCampaignBodySchema,
  UpdateCampaignBodySchema,
  EnrollLeadsBodySchema,
} from "../schemas/campaign.schema.js";
import type { z } from "zod";

type CreateCampaignBody = z.infer<typeof CreateCampaignBodySchema>;
type UpdateCampaignBody = z.infer<typeof UpdateCampaignBodySchema>;
type EnrollLeadsBody = z.infer<typeof EnrollLeadsBodySchema>;
type CampaignStepInput = z.infer<typeof CreateCampaignBodySchema>["steps"][number];

/* ============================================================
 * Helpers
 * ============================================================ */

function toIso(d: Date): string {
  return d.toISOString();
}

function validateSteps(
  steps: ReadonlyArray<CampaignStepInput>,
): CampaignStepInput[] {
  // Reject empty step list (already enforced at the schema level
  // for create; for update we allow an empty list to mean "clear all").
  // Branch steps must point to valid step indices.
  const total = steps.length;
  for (const step of steps) {
    if (step.stepType === "BRANCH") {
      const cfg = step.branchConfig;
      if (cfg) {
        if (cfg.thenStep >= total || cfg.elseStep >= total) {
          throw new ValidationError(
            `BRANCH step "${step.name}" points to a step index outside the campaign`,
          );
        }
      }
    }
  }
  return [...steps];
}

/* ============================================================
 * Public surface
 * ============================================================ */

export const campaignService = {
  /* ----------- CRUD ----------- */

  /**
   * Create a draft campaign. Always DRAFT; callers explicitly
   * activate via `activate()`. Returns the campaign with steps.
   */
  async create(
    dealerId: string,
    actorId: string,
    input: CreateCampaignBody,
  ): Promise<CampaignWithStepsAndOwner> {
    const steps = validateSteps(input.steps);

    const created = await prisma.campaign.create({
      data: {
        dealerId,
        createdById: actorId,
        name: input.name,
        description: input.description ?? null,
        status: "DRAFT",
        triggerType: input.triggerType,
        triggerConfig: (input.triggerConfig ?? {}) as Prisma.InputJsonValue,
        audience: (input.audience ?? {}) as Prisma.InputJsonValue,
        steps: {
          create: steps.map((s, idx) => buildStepData(s, idx)),
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    return created;
  },

  /**
   * List campaigns for a dealer. Cursor pagination on `id`.
   */
  async list(
    dealerId: string,
    args: {
      status?: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
      triggerType?:
        | "LEAD_CREATED"
        | "LEAD_UPDATED"
        | "STATUS_CHANGE"
        | "NO_ACTIVITY"
        | "DEAL_STAGE"
        | "APPOINTMENT"
        | "SCORE_CHANGE"
        | "BIRTHDAY"
        | "VEHICLE_MATCH"
        | "MANUAL"
        | "API";
      search?: string;
      limit: number;
      cursor?: string;
    },
  ): Promise<{ items: CampaignSummary[]; pagination: { hasMore: boolean; cursor: string | null } }> {
    const where: Prisma.CampaignWhereInput = { dealerId };
    if (args.status) where.status = args.status;
    if (args.triggerType) where.triggerType = args.triggerType;
    if (args.search && args.search.length > 0) {
      const s = args.search.trim();
      where.OR = [
        { name: { contains: s, mode: "insensitive" } },
        { description: { contains: s, mode: "insensitive" } },
      ];
    }
    const limit = Math.min(args.limit, 200);
    const rows = await prisma.campaign.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { steps: true } },
      },
    });
    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const items: CampaignSummary[] = trimmed.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      status: c.status,
      triggerType: c.triggerType,
      enrolledCount: c.enrolledCount,
      activeCount: c.activeCount,
      completedCount: c.completedCount,
      exitedCount: c.exitedCount,
      failedCount: c.failedCount,
      activatedAt: c.activatedAt ? toIso(c.activatedAt) : null,
      pausedAt: c.pausedAt ? toIso(c.pausedAt) : null,
      archivedAt: c.archivedAt ? toIso(c.archivedAt) : null,
      createdAt: toIso(c.createdAt),
      updatedAt: toIso(c.updatedAt),
      createdBy: c.createdBy,
      stepCount: c._count.steps,
    }));
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, pagination: { hasMore, cursor: nextCursor } };
  },

  async getById(
    dealerId: string,
    id: string,
  ): Promise<CampaignDetail> {
    const campaign = await prisma.campaign.findFirst({
      where: { dealerId, id },
      include: {
        createdBy: { select: { id: true, name: true } },
        steps: { orderBy: { order: "asc" } },
        _count: { select: { steps: true } },
      },
    });
    if (!campaign) throw new NotFoundError("Campaign not found");
    return toCampaignDetail(campaign);
  },

  async update(
    dealerId: string,
    id: string,
    input: UpdateCampaignBody,
  ): Promise<CampaignDetail> {
    const existing = await prisma.campaign.findFirst({
      where: { dealerId, id },
      include: { _count: { select: { steps: true } } },
    });
    if (!existing) throw new NotFoundError("Campaign not found");
    if (existing.status === "ARCHIVED") {
      throw new ConflictError("Cannot update an archived campaign");
    }

    return prisma.$transaction(async (tx) => {
      const data: Prisma.CampaignUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;
      if (input.triggerType !== undefined) data.triggerType = input.triggerType;
      if (input.triggerConfig !== undefined) {
        data.triggerConfig = input.triggerConfig as Prisma.InputJsonValue;
      }
      if (input.audience !== undefined) {
        data.audience = input.audience as Prisma.InputJsonValue;
      }

      if (input.steps !== undefined) {
        validateSteps(input.steps);
        // Replace the whole step set. We use deleteMany + create in
        // a single tx so the campaign has no orphan steps.
        await tx.campaignStep.deleteMany({ where: { campaignId: id } });
        if (input.steps.length > 0) {
          const steps: CampaignStepInput[] = input.steps;
          await tx.campaignStep.createMany({
            data: steps.map((s: CampaignStepInput, idx: number) => ({
              ...buildStepData(s, idx),
              campaignId: id,
            })),
          });
        }
      }

      await tx.campaign.update({ where: { id }, data });
      const reloaded = await tx.campaign.findFirstOrThrow({
        where: { id },
        include: {
          createdBy: { select: { id: true, name: true } },
          steps: { orderBy: { order: "asc" } },
          _count: { select: { steps: true } },
        },
      });
      return toCampaignDetail(reloaded);
    });
  },

  async archive(dealerId: string, id: string): Promise<{ id: string }> {
    const existing = await prisma.campaign.findFirst({
      where: { dealerId, id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundError("Campaign not found");
    await prisma.campaign.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return { id };
  },

  /* ----------- Lifecycle ----------- */

  async activate(
    dealerId: string,
    id: string,
  ): Promise<{ id: string; status: "ACTIVE" }> {
    const existing = await prisma.campaign.findFirst({
      where: { dealerId, id },
      include: { _count: { select: { steps: true } } },
    });
    if (!existing) throw new NotFoundError("Campaign not found");
    if (existing.status === "ARCHIVED") {
      throw new ConflictError("Cannot activate an archived campaign");
    }
    if (existing._count.steps === 0) {
      throw new ValidationError("Cannot activate a campaign with no steps");
    }
    if (existing.status === "ACTIVE") {
      return { id, status: "ACTIVE" };
    }
    await prisma.campaign.update({
      where: { id },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        pausedAt: null,
      },
    });
    return { id, status: "ACTIVE" };
  },

  async pause(
    dealerId: string,
    id: string,
  ): Promise<{ id: string; status: "PAUSED" }> {
    const existing = await prisma.campaign.findFirst({
      where: { dealerId, id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundError("Campaign not found");
    if (existing.status !== "ACTIVE") {
      throw new ConflictError("Only active campaigns can be paused");
    }
    await prisma.campaign.update({
      where: { id },
      data: { status: "PAUSED", pausedAt: new Date() },
    });
    return { id, status: "PAUSED" };
  },

  /* ----------- Enrollment ----------- */

  /**
   * Manually enroll one or more leads and/or customers. Idempotent
   * unless `replace: true` — see schema docs.
   */
  async enroll(
    dealerId: string,
    actorId: string,
    campaignId: string,
    input: EnrollLeadsBody,
  ): Promise<{
    enrolled: number;
    skipped: number;
    backfilled: number;
  }> {
    const campaign = await prisma.campaign.findFirst({
      where: { dealerId, id: campaignId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!campaign) throw new NotFoundError("Campaign not found");
    if (campaign.status === "ARCHIVED") {
      throw new ConflictError("Cannot enroll into an archived campaign");
    }

    // Optionally tear down existing active enrollments.
    if (input.replace) {
      const existing = await prisma.campaignEnrollment.findMany({
        where: {
          dealerId,
          campaignId,
          status: { in: ["PENDING", "ACTIVE", "PAUSED"] },
        },
        select: { id: true, status: true },
      });
      for (const e of existing) {
        await prisma.campaignEnrollment.update({
          where: { id: e.id },
          data: {
            status: "EXITED",
            exitedAt: new Date(),
            lastError: "Replaced by manual enrollment",
          },
        });
      }
      // Counters: replace = activeCount -> 0, then rebuild below.
      if (existing.length > 0) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { activeCount: { decrement: existing.length } },
        });
      }
    }

    // Resolve the lead / customer set.
    const leadIds = new Set<string>(input.leadIds ?? []);
    const customerIds = new Set<string>(input.customerIds ?? []);

    if (input.useAudience) {
      const audience = (campaign.audience ?? {}) as Record<string, unknown>;
      const where: Prisma.LeadWhereInput = { dealerId };
      const sourceV = stringField(audience, "source");
      const statusV = stringField(audience, "status");
      const classificationV = stringField(audience, "classification");
      if (sourceV) where.source = sourceV;
      if (statusV) where.status = statusV as Prisma.EnumLeadStatusFilter["equals"];
      if (classificationV) where.classification = classificationV;
      const max = numberField(audience, "maxEnroll") ?? 500;
      const backfilledLeads = await prisma.lead.findMany({
        where,
        take: Math.min(max, 2000),
        select: { id: true },
      });
      for (const l of backfilledLeads) leadIds.add(l.id);
      const includeCustomers = audience.includeCustomers !== false;
      if (includeCustomers) {
        const backfilledCustomers = await prisma.customer.findMany({
          where: { dealerId, deletedAt: null },
          take: Math.min(max, 2000),
          select: { id: true },
        });
        for (const c of backfilledCustomers) customerIds.add(c.id);
      }
    }

    // Filter out already-enrolled (unless replace: true).
    let enrolled = 0;
    let skipped = 0;
    let backfilled = 0;
    if (input.useAudience) backfilled = leadIds.size + customerIds.size;

    // Enroll leads.
    for (const leadId of leadIds) {
      const result = await enrollOne(
        dealerId,
        actorId,
        campaign,
        "lead",
        leadId,
      );
      if (result === "enrolled") enrolled += 1;
      else skipped += 1;
    }
    // Enroll customers.
    for (const customerId of customerIds) {
      const result = await enrollOne(
        dealerId,
        actorId,
        campaign,
        "customer",
        customerId,
      );
      if (result === "enrolled") enrolled += 1;
      else skipped += 1;
    }

    return { enrolled, skipped, backfilled };
  },

  /**
   * Unenroll a single enrollment. Allowed for any non-terminal state.
   */
  async unenroll(
    dealerId: string,
    enrollmentId: string,
    reason: string | null,
  ): Promise<{ id: string }> {
    const enrollment = await prisma.campaignEnrollment.findFirst({
      where: { dealerId, id: enrollmentId },
      select: { id: true, status: true, campaignId: true },
    });
    if (!enrollment) throw new NotFoundError("Enrollment not found");
    if (["COMPLETED", "EXITED", "FAILED"].includes(enrollment.status)) {
      throw new ConflictError(`Cannot unenroll a ${enrollment.status} enrollment`);
    }
    await prisma.campaignEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: "EXITED",
        exitedAt: new Date(),
        lastError: reason,
        nextRunAt: null,
      },
    });
    await prisma.campaign.update({
      where: { id: enrollment.campaignId },
      data: { exitedCount: { increment: 1 }, activeCount: { decrement: 1 } },
    });
    return { id: enrollmentId };
  },

  /* ----------- Stats ----------- */

  async stats(dealerId: string, id: string, days: number): Promise<CampaignStats> {
    const campaign = await prisma.campaign.findFirst({
      where: { dealerId, id },
      select: {
        id: true,
        enrolledCount: true,
        activeCount: true,
        completedCount: true,
        exitedCount: true,
        failedCount: true,
      },
    });
    if (!campaign) throw new NotFoundError("Campaign not found");

    const cutoff = new Date(Date.now() - days * 86_400_000);
    const [emails, sms, recentEnrolled, recentCompleted, recentFailed, timelineRaw] =
      await Promise.all([
        prisma.campaignStepExecution.count({
          where: { dealerId, stepType: "EMAIL", status: { in: ["SENT", "DELIVERED"] } },
        }),
        prisma.campaignStepExecution.count({
          where: { dealerId, stepType: "SMS", status: { in: ["SENT", "DELIVERED"] } },
        }),
        prisma.campaignEnrollment.count({
          where: { campaignId: id, enrolledAt: { gte: cutoff } },
        }),
        prisma.campaignEnrollment.count({
          where: { campaignId: id, completedAt: { gte: cutoff } },
        }),
        prisma.campaignEnrollment.count({
          where: { campaignId: id, failedAt: { gte: cutoff } },
        }),
        // Time-series: bucketed by day, last `days` days.
        prisma.$queryRaw<Array<{ day: Date; enrolled: bigint; completed: bigint; failed: bigint }>>(
          Prisma.sql`
            SELECT
              date_trunc('day', "enrolledAt") AS day,
              COUNT(*) FILTER (WHERE "enrolledAt" IS NOT NULL) AS enrolled,
              COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL) AS completed,
              COUNT(*) FILTER (WHERE "failedAt" IS NOT NULL) AS failed
            FROM "campaign_enrollments"
            WHERE "campaignId" = ${id} AND "enrolledAt" >= ${cutoff}
            GROUP BY day
            ORDER BY day ASC
          `,
        ),
      ]);

    // Build a dense time-series (one entry per day, zero-filled).
    const timeline: CampaignStatsTimelinePoint[] = [];
    const byDay = new Map<string, { enrolled: number; completed: number; failed: number }>();
    for (const r of timelineRaw) {
      const day = r.day instanceof Date ? r.day : new Date(r.day);
      const key = day.toISOString().slice(0, 10);
      byDay.set(key, {
        enrolled: Number(r.enrolled),
        completed: Number(r.completed),
        failed: Number(r.failed),
      });
    }
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const r = byDay.get(d) ?? { enrolled: 0, completed: 0, failed: 0 };
      timeline.push({ date: d, ...r });
    }

    const conversion =
      campaign.enrolledCount > 0
        ? campaign.completedCount / campaign.enrolledCount
        : 0;

    return {
      enrolledCount: campaign.enrolledCount,
      activeCount: campaign.activeCount,
      completedCount: campaign.completedCount,
      exitedCount: campaign.exitedCount,
      failedCount: campaign.failedCount,
      emailsSent: emails,
      smsSent: sms,
      conversionRate: Math.round(conversion * 1000) / 1000,
      recentEnrollments: recentEnrolled,
      recentCompletions: recentCompleted,
      recentFailures: recentFailed,
      timeline,
    };
  },

  /* ----------- Enrollment listing ----------- */

  async listEnrollments(
    dealerId: string,
    campaignId: string,
    args: {
      status?:
        | "PENDING"
        | "ACTIVE"
        | "PAUSED"
        | "COMPLETED"
        | "EXITED"
        | "FAILED";
      limit: number;
      cursor?: string;
    },
  ): Promise<{
    items: EnrollmentListItem[];
    pagination: { hasMore: boolean; cursor: string | null };
  }> {
    const where: Prisma.CampaignEnrollmentWhereInput = { dealerId, campaignId };
    if (args.status) where.status = args.status;
    const limit = Math.min(args.limit, 200);
    const rows = await prisma.campaignEnrollment.findMany({
      where,
      take: limit + 1,
      orderBy: { enrolledAt: "desc" },
      ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
      include: {
        lead: { select: { firstName: true, lastName: true, email: true, phone: true } },
        customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    });
    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const items: EnrollmentListItem[] = trimmed.map((e) => {
      const firstName = e.lead?.firstName ?? e.customer?.firstName ?? null;
      const lastName = e.lead?.lastName ?? e.customer?.lastName ?? null;
      const subjectName =
        firstName && lastName
          ? `${firstName} ${lastName}`.trim()
          : firstName ?? lastName ?? null;
      return {
        id: e.id,
        campaignId: e.campaignId,
        leadId: e.leadId,
        customerId: e.customerId,
        status: e.status,
        currentStepOrder: e.currentStepOrder,
        nextRunAt: e.nextRunAt ? toIso(e.nextRunAt) : null,
        stepsExecuted: e.stepsExecuted,
        stepsFailed: e.stepsFailed,
        emailsSent: e.emailsSent,
        smsSent: e.smsSent,
        lastError: e.lastError,
        enrolledAt: toIso(e.enrolledAt),
        startedAt: e.startedAt ? toIso(e.startedAt) : null,
        completedAt: e.completedAt ? toIso(e.completedAt) : null,
        exitedAt: e.exitedAt ? toIso(e.exitedAt) : null,
        failedAt: e.failedAt ? toIso(e.failedAt) : null,
        subjectName,
        subjectEmail: e.lead?.email ?? e.customer?.email ?? null,
        subjectPhone: e.lead?.phone ?? e.customer?.phone ?? null,
      };
    });
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, pagination: { hasMore, cursor: nextCursor } };
  },
};

/* ============================================================
 * Internal helpers
 * ============================================================ */

function buildStepData(
  step: CampaignStepInput,
  order: number,
): Prisma.CampaignStepCreateWithoutCampaignInput {
  return {
    order,
    name: step.name,
    stepType: step.stepType,
    template: step.template ?? null,
    subject: step.subject ?? null,
    waitHours: step.waitHours ?? null,
    branchConfig: (step.branchConfig ?? undefined) as Prisma.InputJsonValue | undefined,
    webhookUrl: step.webhookUrl ?? null,
    webhookMethod: step.webhookMethod ?? "POST",
    taskAssignToId: step.taskAssignToId ?? null,
    fromAddress: step.fromAddress ?? null,
    skipWeekends: step.skipWeekends ?? false,
    metadata: (step.metadata ?? {}) as Prisma.InputJsonValue,
  };
}

async function enrollOne(
  dealerId: string,
  actorId: string,
  campaign: CampaignWithSteps,
  kind: "lead" | "customer",
  subjectId: string,
): Promise<"enrolled" | "skipped"> {
  // Idempotency check.
  const existing = await prisma.campaignEnrollment.findFirst({
    where: {
      dealerId,
      campaignId: campaign.id,
      ...(kind === "lead" ? { leadId: subjectId } : { customerId: subjectId }),
      status: { in: ["PENDING", "ACTIVE", "PAUSED"] },
    },
    select: { id: true },
  });
  if (existing) return "skipped";

  // Verify the subject still exists & is in good standing.
  if (kind === "lead") {
    const lead = await prisma.lead.findFirst({
      where: { dealerId, id: subjectId },
      select: { id: true, unsubscribed: true, bounced: true },
    });
    if (!lead || lead.unsubscribed || lead.bounced) return "skipped";
  } else {
    const customer = await prisma.customer.findFirst({
      where: { dealerId, id: subjectId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) return "skipped";
  }

  const enrollment = await prisma.campaignEnrollment.create({
    data: {
      dealerId,
      campaignId: campaign.id,
      leadId: kind === "lead" ? subjectId : null,
      customerId: kind === "customer" ? subjectId : null,
      enrolledById: actorId,
      triggerType: "MANUAL",
      triggerPayload: {},
      status: "PENDING",
      currentStepOrder: 0,
      nextRunAt: new Date(),
    },
    select: { id: true },
  });

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      enrolledCount: { increment: 1 },
      activeCount: { increment: 1 },
    },
  });

  const firstStep = campaign.steps[0];
  if (firstStep) {
    await campaignQueue.enqueueStep({
      dealerId,
      enrollmentId: enrollment.id,
      stepId: firstStep.id,
    });
  }
  return "enrolled";
}

function stringField(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function numberField(
  obj: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/* ============================================================
 * Public response types
 * ============================================================ */

export interface CampaignSummary {
  id: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  triggerType:
    | "LEAD_CREATED"
    | "LEAD_UPDATED"
    | "STATUS_CHANGE"
    | "NO_ACTIVITY"
    | "DEAL_STAGE"
    | "APPOINTMENT"
    | "SCORE_CHANGE"
    | "BIRTHDAY"
    | "VEHICLE_MATCH"
    | "MANUAL"
    | "API";
  enrolledCount: number;
  activeCount: number;
  completedCount: number;
  exitedCount: number;
  failedCount: number;
  activatedAt: string | null;
  pausedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
  stepCount: number;
}

export interface CampaignStepResponse {
  id: string;
  campaignId: string;
  order: number;
  name: string;
  stepType:
    | "EMAIL"
    | "SMS"
    | "WAIT"
    | "BRANCH"
    | "WEBHOOK"
    | "TASK"
    | "EXIT";
  template: string | null;
  subject: string | null;
  waitHours: number | null;
  branchConfig: Record<string, unknown> | null;
  webhookUrl: string | null;
  webhookMethod: string | null;
  taskAssignToId: string | null;
  fromAddress: string | null;
  skipWeekends: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignDetail {
  id: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  triggerType: CampaignSummary["triggerType"];
  triggerConfig: Record<string, unknown>;
  audience: Record<string, unknown>;
  enrolledCount: number;
  activeCount: number;
  completedCount: number;
  exitedCount: number;
  failedCount: number;
  activatedAt: string | null;
  pausedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
  steps: CampaignStepResponse[];
  stepCount: number;
}

export interface CampaignStats {
  enrolledCount: number;
  activeCount: number;
  completedCount: number;
  exitedCount: number;
  failedCount: number;
  emailsSent: number;
  smsSent: number;
  conversionRate: number;
  recentEnrollments: number;
  recentCompletions: number;
  recentFailures: number;
  timeline: CampaignStatsTimelinePoint[];
}

export interface CampaignStatsTimelinePoint {
  date: string;
  enrolled: number;
  completed: number;
  failed: number;
}

export interface EnrollmentListItem {
  id: string;
  campaignId: string;
  leadId: string | null;
  customerId: string | null;
  status:
    | "PENDING"
    | "ACTIVE"
    | "PAUSED"
    | "COMPLETED"
    | "EXITED"
    | "FAILED";
  currentStepOrder: number;
  nextRunAt: string | null;
  stepsExecuted: number;
  stepsFailed: number;
  emailsSent: number;
  smsSent: number;
  lastError: string | null;
  enrolledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  exitedAt: string | null;
  failedAt: string | null;
  subjectName: string | null;
  subjectEmail: string | null;
  subjectPhone: string | null;
}

type CampaignWithSteps = Campaign & { steps: CampaignStep[] };
type CampaignWithStepsAndOwner = Prisma.CampaignGetPayload<{
  include: { steps: true };
}>;

function toCampaignDetail(
  c: Prisma.CampaignGetPayload<{
    include: {
      createdBy: { select: { id: true; name: true } };
      steps: { orderBy: { order: "asc" } };
      _count: { select: { steps: true } };
    };
  }>,
): CampaignDetail {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    triggerType: c.triggerType,
    triggerConfig: (c.triggerConfig ?? {}) as Record<string, unknown>,
    audience: (c.audience ?? {}) as Record<string, unknown>,
    enrolledCount: c.enrolledCount,
    activeCount: c.activeCount,
    completedCount: c.completedCount,
    exitedCount: c.exitedCount,
    failedCount: c.failedCount,
    activatedAt: c.activatedAt ? toIso(c.activatedAt) : null,
    pausedAt: c.pausedAt ? toIso(c.pausedAt) : null,
    archivedAt: c.archivedAt ? toIso(c.archivedAt) : null,
    createdAt: toIso(c.createdAt),
    updatedAt: toIso(c.updatedAt),
    createdBy: c.createdBy,
    steps: c.steps.map((s) => ({
      id: s.id,
      campaignId: s.campaignId,
      order: s.order,
      name: s.name,
      stepType: s.stepType,
      template: s.template,
      subject: s.subject,
      waitHours: s.waitHours,
      branchConfig: (s.branchConfig ?? null) as Record<string, unknown> | null,
      webhookUrl: s.webhookUrl,
      webhookMethod: s.webhookMethod,
      taskAssignToId: s.taskAssignToId,
      fromAddress: s.fromAddress,
      skipWeekends: s.skipWeekends,
      metadata: (s.metadata ?? {}) as Record<string, unknown>,
      createdAt: toIso(s.createdAt),
      updatedAt: toIso(s.updatedAt),
    })),
    stepCount: c._count.steps,
  };
}

/* ============================================================
 * Re-export the trigger service as a convenience for tests.
 * ============================================================ */

export { campaignTriggers };
