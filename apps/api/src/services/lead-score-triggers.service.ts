/**
 * Lead Score Triggers — orchestrates score recompute on lead events.
 *
 * Pure scoring lives in `lead-scorer.service.ts`. This module is the
 * "dirty" side: it loads the lead's full context, runs the pure scorer,
 * persists a `LeadScore` row, and updates `Lead.currentScore` and
 * `Lead.classification`.
 *
 * Multi-tenant: every Prisma call is scoped by `dealerId` (provided by
 * the caller, derived from the authenticated JWT).
 *
 * Triggers (called from routes / webhooks / background jobs):
 *   - onLeadCreated
 *   - onLeadUpdated
 *   - onLeadStatusChanged
 *   - onLeadActivity
 *   - onLeadMarkedLost
 *   - onLeadContacted (e.g. inbound message arrived)
 *   - periodicCatchupSweep (24h drift catch)
 *
 * All triggers are *idempotent in intent* — recomputing the same lead
 * state yields the same score; duplicate trigger calls just create
 * another history row.
 */

import type { Activity, Communication, Lead, Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { leadScorer, type ScoreContext, type ScoreResult } from "./lead-scorer.service.js";
import { logger } from "../utils/logger.js";

/* ============================================================
 * Logger — best-effort, structured, never throws
 * ============================================================ */

export type TriggerLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
};

const consoleLogger: TriggerLogger = {
  info: (obj, msg) => {
    logger.info("lead-score", JSON.stringify({ level: "info", ...obj, msg }));
  },
  warn: (obj, msg) => {
    logger.warn("lead-score", JSON.stringify({ level: "warn", ...obj, msg }));
  },
  error: (obj, msg) => {
    logger.error("lead-score", JSON.stringify({ level: "error", ...obj, msg }));
  },
  debug: (obj, msg) => {
    logger.debug("lead-score", JSON.stringify({ level: "debug", ...obj, msg }));
  },
};

const defaultLogger: TriggerLogger = consoleLogger;

/* ============================================================
 * Trigger names
 * ============================================================ */

export type ScoreTrigger =
  | "lead_created"
  | "lead_updated"
  | "status_changed"
  | "activity_logged"
  | "marked_lost"
  | "marked_contacted"
  | "drift_sweep"
  | "manual";

/* ============================================================
 * Context loading
 * ============================================================ */

interface LoadResult {
  lead: Lead;
  hasAppointment: boolean;
  hasResponded: boolean;
  hasReplied: boolean;
  contactAttemptsSinceLastResponse: number;
  vehicleInInventory: boolean;
  duplicateOfCustomer: boolean;
}

/**
 * Hydrate every signal the pure scorer needs for one lead. Issues a
 * small handful of indexed queries — `@@index([dealerId, leadId,
 * scoredAt])` keeps the history read cheap.
 */
async function loadContext(
  dealerId: string,
  leadId: string,
  now: Date,
): Promise<LoadResult | null> {
  const lead = await prisma.lead.findFirst({
    where: { dealerId, id: leadId },
  });
  if (!lead) return null;

  // Parallelise the supporting reads.
  const [appointments, activities, communications, attempts, customer] =
    await Promise.all([
      prisma.appointment.findMany({
        where: { dealerId, leadId },
        select: { id: true, status: true, scheduledAt: true },
        take: 50,
        orderBy: { scheduledAt: "desc" },
      }),
      prisma.activity.findMany({
        where: { dealerId, entityType: "LEAD", entityId: leadId },
        select: { id: true, type: true, createdAt: true },
        take: 100,
        orderBy: { createdAt: "desc" },
      }),
      prisma.communication.findMany({
        where: { dealerId, leadId },
        select: { id: true, direction: true, status: true, sentAt: true },
        take: 100,
        orderBy: { sentAt: "desc" },
      }),
      prisma.activity.count({
        where: {
          dealerId,
          entityType: "LEAD",
          entityId: leadId,
          type: { in: ["CALL", "EMAIL", "SMS"] },
        },
      }),
      lead.customerId
        ? prisma.customer.findUnique({
            where: { id: lead.customerId },
            select: { id: true, dealerId: true },
          })
        : Promise.resolve(null),
    ]);

  const hasAppointment = appointments.length > 0;
  const hasResponded = activities.some(
    (a: Pick<Activity, "type">) =>
      a.type === "APPOINTMENT" || a.type === "STATUS_CHANGE",
  );
  const hasReplied = communications.some(
    (c: Pick<Communication, "direction">) => c.direction === "INBOUND",
  );

  // "Contact attempts" since last response. If the lead was never
  // responded, count from creation. We approximate "last response" as
  // the most recent inbound communication (or completed appointment,
  // or status change to CONTACTED+).
  const lastResponseAt = pickLastResponse(activities, communications);
  const sinceMs = lastResponseAt
    ? lastResponseAt.getTime()
    : lead.createdAt.getTime();
  const attemptsSinceLastResponse = countAttemptsBetween(
    activities,
    sinceMs,
    now,
  );

  // Vehicle in inventory: query vehicles for matching vin / stockNumber
  // / make+model combination from the lead's vehicleInterest array.
  const vehicleInInventory = await checkVehicleInInventory(dealerId, lead);

  return {
    lead,
    hasAppointment,
    hasResponded,
    hasReplied,
    contactAttemptsSinceLastResponse: attemptsSinceLastResponse,
    vehicleInInventory,
    duplicateOfCustomer: Boolean(customer && customer.dealerId === dealerId),
  };
}

function pickLastResponse(
  activities: ReadonlyArray<Pick<Activity, "type" | "createdAt">>,
  communications: ReadonlyArray<Pick<Communication, "direction" | "sentAt">>,
): Date | null {
  const candidates: Date[] = [];
  for (const a of activities) {
    if (a.type === "APPOINTMENT" || a.type === "STATUS_CHANGE") {
      candidates.push(a.createdAt);
    }
  }
  for (const c of communications) {
    if (c.direction === "INBOUND") candidates.push(c.sentAt);
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a > b ? a : b));
}

function countAttemptsBetween(
  activities: ReadonlyArray<Pick<Activity, "type" | "createdAt">>,
  sinceMs: number,
  _now: Date,
): number {
  let n = 0;
  for (const a of activities) {
    if (a.createdAt.getTime() < sinceMs) break; // activities sorted desc
    if (a.type === "CALL" || a.type === "EMAIL" || a.type === "SMS") {
      n += 1;
    }
  }
  return n;
}

async function checkVehicleInInventory(
  dealerId: string,
  lead: Lead,
): Promise<boolean> {
  const interest = leadScorer.parseVehicleInterest(lead.vehicleInterest);
  if (interest.length === 0) return false;

  // Build a set of OR conditions we can hand to Prisma. We accept any
  // hit on vin, stockNumber, or (make + model).
  const orClauses: Prisma.VehicleWhereInput[] = [];
  for (const v of interest) {
    if (v.vin) orClauses.push({ vin: v.vin });
    if (v.stockNumber) orClauses.push({ stockNumber: v.stockNumber });
    if (v.make && v.model) {
      orClauses.push({ make: v.make, model: v.model });
    }
  }
  if (orClauses.length === 0) return false;

  const hit = await prisma.vehicle.findFirst({
    where: { dealerId, OR: orClauses },
    select: { id: true },
  });
  return Boolean(hit);
}

/* ============================================================
 * Persist
 * ============================================================ */

interface PersistResult {
  result: ScoreResult;
  historyId: string;
}

/**
 * Recompute and persist. Returns the result + the history row id.
 * Always overwrites the lead's `currentScore` / `classification`.
 */
export async function recomputeAndPersist(
  dealerId: string,
  leadId: string,
  trigger: ScoreTrigger,
  log: TriggerLogger = defaultLogger,
): Promise<PersistResult | null> {
  const now = new Date();
  const loaded = await loadContext(dealerId, leadId, now);
  if (!loaded) {
    log.warn({ dealerId, leadId }, "recompute: lead not found");
    return null;
  }

  const context: ScoreContext = {
    dealerId,
    leadId,
    source: loaded.lead.source,
    createdAt: loaded.lead.createdAt,
    lastContactedAt: loaded.lead.lastContactedAt,
    vehicleInterest: leadScorer.parseVehicleInterest(loaded.lead.vehicleInterest),
    bounced: loaded.lead.bounced,
    unsubscribed: loaded.lead.unsubscribed,
    duplicateOfCustomer: loaded.duplicateOfCustomer,
    email: loaded.lead.email,
    phone: loaded.lead.phone,
    contactAttemptsSinceLastResponse: loaded.contactAttemptsSinceLastResponse,
    hasResponded: loaded.hasResponded,
    hasAppointment: loaded.hasAppointment,
    hasReplied: loaded.hasReplied,
    vehicleInInventory: loaded.vehicleInInventory,
    now,
  };

  const result = leadScorer.scoreLead(context);

  // Persist: history row + denormalised lead fields in a single
  // transaction so the UI never sees a half-updated state.
  const history = await prisma.$transaction(async (tx) => {
    const row = await tx.leadScore.create({
      data: {
        dealerId,
        leadId,
        score: result.score,
        classification: result.classification,
        signals: result.signals as unknown as Prisma.InputJsonValue,
        modelVersion: result.modelVersion,
        scoredAt: now,
      },
      select: { id: true },
    });
    await tx.lead.updateMany({
      where: { dealerId, id: leadId },
      data: {
        currentScore: result.score,
        // `score` is kept in sync for the routing engine's compatibility.
        score: result.score,
        classification: result.classification,
        lastScoredAt: now,
      },
    });
    return row;
  });

  log.info(
    {
      dealerId,
      leadId,
      trigger,
      score: result.score,
      classification: result.classification,
      computeMs: result.computeMs,
      historyId: history.id,
    },
    "lead score recomputed",
  );

  return { result, historyId: history.id };
}

/* ============================================================
 * Public trigger API
 * ============================================================ */

export const leadScoreTriggers = {
  recomputeAndPersist,
  loadContext,
  MODEL_VERSION: leadScorer.MODEL_VERSION,
};
