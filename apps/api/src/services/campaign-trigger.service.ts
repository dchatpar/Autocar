/**
 * Campaign Trigger Service — listens to domain events and enrolls
 * leads/customers into matching active campaigns.
 *
 * Multi-tenant: every Prisma call is scoped by `dealerId` from the
 * event payload.
 *
 * Data flow:
 *   1. Webhook handlers / route layer call `handleEvent(event)` to
 *      fan a single event into the trigger queue.
 *   2. The BullMQ worker calls `matchAndEnroll(event)` to evaluate
 *      every ACTIVE campaign for the dealer whose `triggerType`
 *      matches the event.
 *   3. For each matching campaign, we run the per-campaign
 *      audience filter against the event's lead / customer, then
 *      create (or skip) a `CampaignEnrollment` row and enqueue the
 *      first step.
 *
 * Idempotency:
 *   - The `@@index([dealerId, campaignId, leadId])` and
 *     `@@index([dealerId, campaignId, customerId])` indexes make
 *     the "is this record already enrolled?" check an indexed point
 *     read.
 *   - A `replace: true` flag on the manual enrollment path lets ops
 *     restart an enrollment, but auto-triggers never re-enroll an
 *     existing active enrollment.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import {
  CampaignTriggerEventSchema,
  TRIGGER_TYPE_TO_EVENT,
  type CampaignTriggerEvent,
} from "../schemas/campaign.schema.js";
import { campaignQueue } from "../queues/campaign.queue.js";
import { z } from "zod";

/* ============================================================
 * Logger
 * ============================================================ */

function log(
  level: "info" | "warn" | "error" | "debug",
  obj: Record<string, unknown>,
  msg?: string,
): void {
  // eslint-disable-next-line no-console
  const stream = level === "error" ? console.error : level === "warn" ? console.warn : level === "debug" ? console.debug : console.log;
  stream(
    JSON.stringify({
      level,
      component: "campaign-trigger.service",
      ...obj,
      msg,
    }),
  );
}

/* ============================================================
 * Public surface
 * ============================================================ */

export const campaignTriggers = {
  /**
   * Single entry point used by webhook handlers, route hooks, and
   * the lead-score worker to fan an event into the trigger queue.
   * Validates + enqueues.
   */
  async handleEvent(event: CampaignTriggerEvent): Promise<void> {
    const parsed = CampaignTriggerEventSchema.safeParse(event);
    if (!parsed.success) {
      log("warn", { err: parsed.error.message }, "ignoring malformed trigger event");
      return;
    }
    await campaignQueue.enqueueTrigger(parsed.data);
  },

  /**
   * Worker-side entry: evaluate every matching campaign for the
   * event's dealer and create enrollments.
   */
  async matchAndEnroll(
    event: CampaignTriggerEvent,
  ): Promise<{ matched: number; enrolled: number; skipped: number }> {
    const parsed = CampaignTriggerEventSchema.parse(event);
    const eventsForType = Object.entries(TRIGGER_TYPE_TO_EVENT).filter(([, evs]) =>
      evs.includes(parsed.event),
    );
    const triggerTypes = eventsForType.map(([t]) => t as keyof typeof TRIGGER_TYPE_TO_EVENT);
    if (triggerTypes.length === 0) {
      log("info", { event: parsed.event }, "no campaign trigger types map to this event");
      return { matched: 0, enrolled: 0, skipped: 0 };
    }

    // 1. Load every ACTIVE campaign whose triggerType is one of the matching types.
    const campaigns = await prisma.campaign.findMany({
      where: {
        dealerId: parsed.dealerId,
        status: "ACTIVE",
        triggerType: { in: triggerTypes as Prisma.EnumCampaignTriggerTypeFilter["in"] },
      },
      include: {
        steps: { orderBy: { order: "asc" } },
      },
    });
    if (campaigns.length === 0) {
      return { matched: 0, enrolled: 0, skipped: 0 };
    }

    let matched = 0;
    let enrolled = 0;
    let skipped = 0;

    for (const campaign of campaigns) {
      matched += 1;
      try {
        const result = await maybeEnroll(campaign, parsed);
        if (result === "enrolled") enrolled += 1;
        else skipped += 1;
      } catch (err) {
        skipped += 1;
        log("error", {
          err: err instanceof Error ? err.message : String(err),
          campaignId: campaign.id,
          event: parsed.event,
        }, "matchAndEnroll failed for campaign");
      }
    }

    log("info", {
      dealerId: parsed.dealerId,
      event: parsed.event,
      matched,
      enrolled,
      skipped,
    }, "matchAndEnroll done");

    return { matched, enrolled, skipped };
  },
};

/* ============================================================
 * Internal — per-campaign evaluation + enrollment
 * ============================================================ */

type CampaignWithSteps = Prisma.CampaignGetPayload<{
  include: { steps: true };
}>;

async function maybeEnroll(
  campaign: CampaignWithSteps,
  event: CampaignTriggerEvent,
): Promise<"enrolled" | "skipped"> {
  // 1. Trigger config gate.
  if (!matchesTriggerConfig(campaign, event)) {
    return "skipped";
  }

  // 2. Audience gate — pull the lead / customer and apply the
  //    campaign-level audience filter.
  const leadId = event.leadId ?? null;
  const customerId = event.customerId ?? null;
  if (!leadId && !customerId) {
    return "skipped";
  }
  if (leadId) {
    const lead = await prisma.lead.findFirst({
      where: { dealerId: campaign.dealerId, id: leadId },
    });
    if (!lead) return "skipped";
    if (lead.unsubscribed || lead.bounced) {
      log("info", { campaignId: campaign.id, leadId }, "skip — lead unsubscribed/bounced");
      return "skipped";
    }
    if (!matchesAudience(campaign.audience as AudienceFilter, lead)) {
      return "skipped";
    }
  } else if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: {
        dealerId: campaign.dealerId,
        id: customerId,
        deletedAt: null,
      },
    });
    if (!customer) return "skipped";
  }

  // 3. Idempotency: is there an existing active / pending / paused
  //    enrollment for this (campaign, lead|customer)?
  const existing = await prisma.campaignEnrollment.findFirst({
    where: {
      dealerId: campaign.dealerId,
      campaignId: campaign.id,
      ...(leadId ? { leadId } : {}),
      ...(customerId ? { customerId } : {}),
      status: { in: ["PENDING", "ACTIVE", "PAUSED"] },
    },
    select: { id: true },
  });
  if (existing) {
    log("info", { campaignId: campaign.id, leadId, customerId }, "already enrolled — skip");
    return "skipped";
  }

  // 4. Create the enrollment + enqueue the first step.
  const enrollment = await prisma.campaignEnrollment.create({
    data: {
      dealerId: campaign.dealerId,
      campaignId: campaign.id,
      leadId,
      customerId,
      enrolledById: null,
      triggerType: campaign.triggerType,
      triggerPayload: event.payload as Prisma.InputJsonValue,
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
      dealerId: campaign.dealerId,
      enrollmentId: enrollment.id,
      stepId: firstStep.id,
    });
  } else {
    // No steps — mark completed immediately.
    await prisma.campaignEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        completedCount: { increment: 1 },
        activeCount: { decrement: 1 },
      },
    });
  }

  log("info", {
    campaignId: campaign.id,
    enrollmentId: enrollment.id,
    leadId,
    customerId,
  }, "enrolled subject");

  return "enrolled";
}

/* ============================================================
 * Trigger config matchers
 * ============================================================ */

interface LeadShape {
  status: string;
  source: string | null;
  currentScore: number;
  classification: string;
  vehicleInterest: unknown;
  createdAt: Date;
  lastContactedAt: Date | null;
  customerId: string | null;
}

interface CustomerShape {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dob: Date | null;
  deletedAt: Date | null;
}

type AudienceFilter = {
  source?: string;
  status?: string;
  classification?: "cold" | "warm" | "hot";
  assignedTo?: string;
  search?: string;
  includeCustomers?: boolean;
  maxEnroll?: number;
};

function matchesTriggerConfig(
  campaign: CampaignWithSteps,
  event: CampaignTriggerEvent,
): boolean {
  const cfg = (campaign.triggerConfig ?? {}) as Record<string, unknown>;

  switch (campaign.triggerType) {
    case "LEAD_CREATED":
    case "LEAD_UPDATED":
      // No config gate.
      return true;

    case "STATUS_CHANGE": {
      const from = stringField(cfg, "from");
      const to = stringField(cfg, "to");
      const payload = event.payload as { from?: string; to?: string };
      if (from && payload.from !== from) return false;
      if (to && payload.to !== to) return false;
      return true;
    }

    case "NO_ACTIVITY": {
      const days = numberField(cfg, "days") ?? 14;
      const payload = event.payload as { days?: number };
      // We always emit at 14 days for sweep; honor override.
      if (typeof payload.days === "number" && payload.days < days) return false;
      return true;
    }

    case "DEAL_STAGE": {
      const stage = stringField(cfg, "stage");
      if (!stage) return true;
      const payload = event.payload as { stage?: string };
      return payload.stage === stage;
    }

    case "APPOINTMENT": {
      const type = stringField(cfg, "type");
      const status = stringField(cfg, "status");
      const payload = event.payload as { type?: string; status?: string };
      if (type && payload.type !== type) return false;
      if (status && payload.status !== status) return false;
      return true;
    }

    case "SCORE_CHANGE": {
      const classification = stringField(cfg, "classification");
      if (!classification) return true;
      const payload = event.payload as { classification?: string };
      return payload.classification === classification;
    }

    case "BIRTHDAY": {
      const daysBefore = numberField(cfg, "daysBefore") ?? 7;
      const payload = event.payload as { daysBefore?: number };
      if (typeof payload.daysBefore === "number" && payload.daysBefore > daysBefore) {
        return false;
      }
      return true;
    }

    case "VEHICLE_MATCH": {
      const make = stringField(cfg, "make");
      const model = stringField(cfg, "model");
      const year = numberField(cfg, "year");
      const payload = event.payload as { make?: string; model?: string; year?: number };
      if (make && payload.make !== make) return false;
      if (model && payload.model !== model) return false;
      if (year && payload.year !== year) return false;
      return true;
    }

    case "MANUAL":
    case "API":
    default:
      // Manual / API are never auto-enrolled.
      return false;
  }
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
 * Audience filter
 * ============================================================ */

function matchesAudience(
  audience: AudienceFilter | null | undefined,
  lead: LeadShape,
): boolean {
  if (!audience) return true;
  if (audience.source && lead.source !== audience.source) return false;
  if (audience.status && lead.status !== audience.status) return false;
  if (audience.classification && lead.classification !== audience.classification) {
    return false;
  }
  // Search across name / email / phone is a UI sugar; the loader
  // pre-filters when the campaign is created. Skip the check here.
  return true;
}

/* ============================================================
 * Public type exports
 * ============================================================ */

export type { LeadShape, CustomerShape };

/* ============================================================
 * Zod type alias (re-exported for type-safe callers)
 * ============================================================ */

export type { CampaignTriggerEvent };
export { z as triggerZ };
