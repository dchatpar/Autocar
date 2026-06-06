/**
 * Lead Scorer — rules-based 0–100 lead quality score.
 *
 * Spec: AdaptUs DMS Module 3.5.
 *   Base: 0
 *   +20 has email
 *   +20 has phone (E.164 valid)
 *   +30 vehicle from our inventory (matched in vehicles table)
 *   +10 budget specified in vehicle_interest
 *   +15 contacted <24h after creation
 *   +25 responded (sent a message, opened email, attended appointment)
 *   +20 scheduled appointment
 *   +15 replied to a call/SMS/email
 *   +10 high-intent source (phone, walk-in, click_to_whatsapp)
 *   +5  source is referral / repeat customer
 *   −10 no response after 3 attempts
 *   −20 overdue >7 days since last contact
 *   −15 unsubscribed / not interested
 *   −25 bad email/phone (bounced or invalid format)
 *   −10 low-quality source (cold email list, scraper)
 *   −5  duplicate of existing customer (spam signal)
 *
 *   0–30   cold
 *   31–60  warm
 *   61–100 hot
 *   Cap at [0, 100].
 *
 * The scoring function is **pure** (no I/O) — feed it a `ScoreContext`
 * snapshot of the lead + its environment, and you get a deterministic
 * `ScoreResult`. Side-effects (writing the LeadScore row, updating the
 * lead's `currentScore`) live in `lead-score-triggers.service.ts`.
 *
 * Multi-tenant safety: the `dealerId` is part of the context only to
 * make the result struct self-describing; the pure function does not
 * call the database.
 */

import { toE164, isValidE164 } from "../utils/phone.js";

/* ============================================================
 * Public types
 * ============================================================ */

export type Classification = "cold" | "warm" | "hot";

/** A snapshot of a lead + everything we need to score it. */
export interface ScoreContext {
  dealerId: string;
  leadId: string;

  /** Source string (free-form). e.g. "Phone", "Walk-in", "Cold Email List". */
  source: string | null;

  /** Lead creation time — used for the <24h contacted rule. */
  createdAt: Date;

  /** Last successful contact (call answered, reply received, etc.). */
  lastContactedAt: Date | null;

  /** Free-form interest items, normalised by the loader:
   *  { make?, model?, year?, vin?, stockNumber?, budget?, sourceMeta? }. */
  vehicleInterest: ReadonlyArray<{
    make?: string | null;
    model?: string | null;
    year?: number | null;
    vin?: string | null;
    stockNumber?: string | null;
    budget?: number | null;
  }>;

  /** Whether the lead's email or phone is flagged as bounced / invalid. */
  bounced: boolean;
  /** Whether the lead unsubscribed or was marked "not interested". */
  unsubscribed: boolean;
  /** Whether the lead is a duplicate of an existing customer. */
  duplicateOfCustomer: boolean;

  /** Email string (raw). */
  email: string | null;
  /** Phone string (raw, free-form). */
  phone: string | null;

  /** Outbound contact attempts since the last response (or since creation). */
  contactAttemptsSinceLastResponse: number;

  /** Did the lead open an email, send a message, or attend an appointment? */
  hasResponded: boolean;
  /** Has at least one scheduled/completed appointment. */
  hasAppointment: boolean;
  /** Has at least one inbound communication (replied to a call/SMS/email). */
  hasReplied: boolean;

  /** Whether the (make, model) of `vehicleInterest` is in our inventory.
   *  Computed by the loader; the scorer itself does not hit the DB. */
  vehicleInInventory: boolean;

  /** "now" for deterministic time math; tests inject a fixed Date. */
  now: Date;
}

export interface ScoreResult {
  score: number;
  classification: Classification;
  /** Per-rule contribution. Keys are the rule ids below. */
  signals: Record<RuleId, number>;
  /** Ordered list of the top contributing rules for tooltips / UI. */
  topSignals: Array<{ rule: RuleId; delta: number; label: string }>;
  /** Model version — bumped when the rule set changes. */
  modelVersion: string;
  /** ms it took to compute. Pure functions are <1ms; reported for SLA. */
  computeMs: number;
}

/** Stable ids for every rule — used as keys in the `signals` map. */
export type RuleId =
  | "hasEmail"
  | "hasPhone"
  | "vehicleInInventory"
  | "budgetSpecified"
  | "contactedUnder24h"
  | "hasResponded"
  | "hasAppointment"
  | "hasReplied"
  | "highIntentSource"
  | "referralOrRepeat"
  | "noResponseAfter3Attempts"
  | "overdue7Days"
  | "unsubscribed"
  | "bouncedContact"
  | "lowQualitySource"
  | "duplicateOfCustomer";

/* ============================================================
 * Rule tables
 * ============================================================ */

const MODEL_VERSION = "rules-v1";

/** Sources considered high-intent. Case-insensitive contains match. */
const HIGH_INTENT_SOURCES: ReadonlyArray<string> = [
  "phone",
  "walk-in",
  "walk_in",
  "walkin",
  "click_to_whatsapp",
  "whatsapp_click",
  "sms_click",
  "live_chat",
  "chat",
];

/** Sources considered "referral" or repeat-customer style. */
const REFERRAL_SOURCES: ReadonlyArray<string> = [
  "referral",
  "repeat",
  "repeat_customer",
  "existing_customer",
];

/** Sources flagged as low-quality (cold email lists, scrapers). */
const LOW_QUALITY_SOURCES: ReadonlyArray<string> = [
  "cold_email",
  "cold email",
  "scraper",
  "scraped",
  "purchased_list",
  "spam",
  "bulk_import",
];

/* ============================================================
 * Helpers (pure)
 * ============================================================ */

function hoursBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (60 * 60 * 1000);
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000);
}

function containsCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function sourceMatches(source: string | null, needles: ReadonlyArray<string>): boolean {
  if (!source) return false;
  const s = source.trim();
  if (s.length === 0) return false;
  return needles.some((n) => containsCI(s, n));
}

/* ============================================================
 * Rule application
 * ============================================================ */

interface RuleOutcome {
  id: RuleId;
  /** Positive (boost) or negative (penalty). Zero means "did not apply". */
  delta: number;
  label: string;
}

function applyRules(ctx: ScoreContext): RuleOutcome[] {
  const out: RuleOutcome[] = [];

  // +20 has email
  if (ctx.email && ctx.email.trim().length > 0) {
    out.push({ id: "hasEmail", delta: 20, label: "Has email address" });
  }

  // +20 has phone (E.164 valid)
  if (ctx.phone) {
    const e164 = toE164(ctx.phone);
    if (e164 && isValidE164(e164)) {
      out.push({ id: "hasPhone", delta: 20, label: "Has valid phone" });
    }
  }

  // +30 vehicle from our inventory
  if (ctx.vehicleInInventory) {
    out.push({
      id: "vehicleInInventory",
      delta: 30,
      label: "Vehicle is in our inventory",
    });
  }

  // +10 budget specified in vehicle_interest
  const hasBudget = ctx.vehicleInterest.some(
    (v) => typeof v.budget === "number" && Number.isFinite(v.budget) && v.budget > 0,
  );
  if (hasBudget) {
    out.push({ id: "budgetSpecified", delta: 10, label: "Budget specified" });
  }

  // +15 contacted <24h after creation
  if (ctx.lastContactedAt) {
    const delta = hoursBetween(ctx.createdAt, ctx.lastContactedAt);
    if (delta <= 24) {
      out.push({
        id: "contactedUnder24h",
        delta: 15,
        label: "Contacted within 24h of creation",
      });
    }
  }

  // +25 responded (sent a message, opened email, attended appointment)
  if (ctx.hasResponded) {
    out.push({
      id: "hasResponded",
      delta: 25,
      label: "Responded (message, email open, or appointment)",
    });
  }

  // +20 scheduled appointment
  if (ctx.hasAppointment) {
    out.push({ id: "hasAppointment", delta: 20, label: "Appointment scheduled" });
  }

  // +15 replied to a call/SMS/email
  if (ctx.hasReplied) {
    out.push({ id: "hasReplied", delta: 15, label: "Replied to outreach" });
  }

  // +10 high-intent source
  if (sourceMatches(ctx.source, HIGH_INTENT_SOURCES)) {
    out.push({
      id: "highIntentSource",
      delta: 10,
      label: `High-intent source (${ctx.source})`,
    });
  }

  // +5 referral / repeat customer
  if (sourceMatches(ctx.source, REFERRAL_SOURCES)) {
    out.push({
      id: "referralOrRepeat",
      delta: 5,
      label: "Referral or repeat customer",
    });
  }

  // −10 no response after 3 attempts
  if (ctx.contactAttemptsSinceLastResponse >= 3) {
    out.push({
      id: "noResponseAfter3Attempts",
      delta: -10,
      label: "No response after 3+ attempts",
    });
  }

  // −20 overdue >7 days since last contact
  if (ctx.lastContactedAt) {
    const overdue = daysBetween(ctx.lastContactedAt, ctx.now);
    if (overdue > 7) {
      out.push({
        id: "overdue7Days",
        delta: -20,
        label: "No contact in over 7 days",
      });
    }
  } else {
    // Never contacted AND created more than 7 days ago.
    const ageDays = daysBetween(ctx.createdAt, ctx.now);
    if (ageDays > 7) {
      out.push({
        id: "overdue7Days",
        delta: -20,
        label: "Never contacted and lead is older than 7 days",
      });
    }
  }

  // −15 unsubscribed / not interested
  if (ctx.unsubscribed) {
    out.push({
      id: "unsubscribed",
      delta: -15,
      label: "Unsubscribed or marked not interested",
    });
  }

  // −25 bad email/phone
  if (ctx.bounced) {
    out.push({
      id: "bouncedContact",
      delta: -25,
      label: "Email or phone is invalid/bounced",
    });
  }

  // −10 low-quality source
  if (sourceMatches(ctx.source, LOW_QUALITY_SOURCES)) {
    out.push({
      id: "lowQualitySource",
      delta: -10,
      label: `Low-quality source (${ctx.source})`,
    });
  }

  // −5 duplicate of existing customer
  if (ctx.duplicateOfCustomer) {
    out.push({
      id: "duplicateOfCustomer",
      delta: -5,
      label: "Duplicate of existing customer",
    });
  }

  return out;
}

/* ============================================================
 * Classification
 * ============================================================ */

export function classify(score: number): Classification {
  if (score < 0) return "cold";
  if (score <= 30) return "cold";
  if (score <= 60) return "warm";
  return "hot";
}

/** Inclusive range check for the boundary values in the spec. */
export const CLASSIFICATION_RANGES: ReadonlyArray<{
  classification: Classification;
  min: number;
  max: number;
}> = [
  { classification: "cold", min: 0, max: 30 },
  { classification: "warm", min: 31, max: 60 },
  { classification: "hot", min: 61, max: 100 },
];

/* ============================================================
 * Public API
 * ============================================================ */

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

/**
 * Pure function. Given a snapshot, returns the deterministic score.
 *
 * Idempotent: identical inputs produce identical outputs.
 * Fast: <1ms on a warm V8 (no allocations beyond the result struct).
 */
export function scoreLead(ctx: ScoreContext): ScoreResult {
  const start =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  const rules = applyRules(ctx);
  const total = rules.reduce((sum, r) => sum + r.delta, 0);
  const score = clamp(Math.round(total), 0, 100);
  const classification = classify(score);

  const signals: Record<RuleId, number> = {
    hasEmail: 0,
    hasPhone: 0,
    vehicleInInventory: 0,
    budgetSpecified: 0,
    contactedUnder24h: 0,
    hasResponded: 0,
    hasAppointment: 0,
    hasReplied: 0,
    highIntentSource: 0,
    referralOrRepeat: 0,
    noResponseAfter3Attempts: 0,
    overdue7Days: 0,
    unsubscribed: 0,
    bouncedContact: 0,
    lowQualitySource: 0,
    duplicateOfCustomer: 0,
  };
  for (const r of rules) signals[r.id] = r.delta;

  // Top signals = sorted by |delta| desc, take up to 3.
  const topSignals = [...rules]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
    .map((r) => ({ rule: r.id, delta: r.delta, label: r.label }));

  const end =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  return {
    score,
    classification,
    signals,
    topSignals,
    modelVersion: MODEL_VERSION,
    computeMs: Math.max(0, end - start),
  };
}

/**
 * Convenience: build a minimal ScoreContext from a Prisma Lead row. Heavy
 * fields (appointments, activities, etc.) are computed by the loader,
 * not this function — this just sets the static pieces.
 */
export function buildContextFromLead(lead: {
  id: string;
  dealerId: string;
  source: string | null;
  createdAt: Date;
  lastContactedAt: Date | null;
  vehicleInterest: unknown;
  bounced: boolean;
  unsubscribed: boolean;
  email: string | null;
  phone: string | null;
}): ScoreContext {
  return {
    dealerId: lead.dealerId,
    leadId: lead.id,
    source: lead.source,
    createdAt: lead.createdAt,
    lastContactedAt: lead.lastContactedAt,
    vehicleInterest: parseVehicleInterest(lead.vehicleInterest),
    bounced: lead.bounced,
    unsubscribed: lead.unsubscribed,
    duplicateOfCustomer: false, // loader overrides after a lookup
    email: lead.email,
    phone: lead.phone,
    contactAttemptsSinceLastResponse: 0, // loader overrides
    hasResponded: false, // loader overrides
    hasAppointment: false, // loader overrides
    hasReplied: false, // loader overrides
    vehicleInInventory: false, // loader overrides
    now: new Date(),
  };
}

/**
 * Parses the JSON `vehicleInterest` column into a typed array.
 * Tolerates: arrays, JSON strings, null/undefined, malformed shapes.
 */
export function parseVehicleInterest(
  raw: unknown,
): ScoreContext["vehicleInterest"] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const out: Array<{
    make: string | null;
    model: string | null;
    year: number | null;
    vin: string | null;
    stockNumber: string | null;
    budget: number | null;
  }> = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    out.push({
      make: typeof obj.make === "string" ? obj.make : null,
      model: typeof obj.model === "string" ? obj.model : null,
      year: typeof obj.year === "number" ? obj.year : null,
      vin: typeof obj.vin === "string" ? obj.vin : null,
      stockNumber:
        typeof obj.stockNumber === "string"
          ? obj.stockNumber
          : typeof obj.stock_number === "string"
            ? obj.stock_number
            : null,
      budget:
        typeof obj.budget === "number"
          ? obj.budget
          : typeof obj.budget === "string"
            ? Number.parseFloat(obj.budget)
            : null,
    });
  }
  return out;
}

export const leadScorer = {
  scoreLead,
  classify,
  buildContextFromLead,
  parseVehicleInterest,
  CLASSIFICATION_RANGES,
  MODEL_VERSION,
};
