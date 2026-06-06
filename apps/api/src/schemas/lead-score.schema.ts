/**
 * Zod schemas for the lead-score API surface.
 *
 * Validation-first: every request body / query is checked before any
 * database call is made.
 */

import { z } from "zod";

/* ============================================================
 * Primitive helpers
 * ============================================================ */

export const ClassificationSchema = z.enum(["cold", "warm", "hot"]);

export const LeadIdParamsSchema = z.object({
  id: z.string().min(1).max(64),
});

/* ============================================================
 * Query schemas
 * ============================================================ */

export const ScoreHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().min(1).max(128).optional(),
});

export const ListLeadsQuerySchema = z.object({
  source: z.string().min(1).max(80).optional(),
  status: z.string().min(1).max(40).optional(),
  assignedTo: z.string().min(1).max(64).optional(),
  search: z.string().min(1).max(200).optional(),
  /** Minimum currentScore (inclusive). E.g. minScore=80 → hot leads only. */
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  /** Maximum currentScore (inclusive). */
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  /** Classification filter. */
  classification: ClassificationSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).max(128).optional(),
});

export const DistributionQuerySchema = z.object({
  /** Recompute live instead of reading the precomputed lead.classification. */
  live: z.coerce.boolean().default(false),
});

/* ============================================================
 * Body schemas
 * ============================================================ */

export const RecomputeBodySchema = z
  .object({
    trigger: z
      .enum([
        "lead_created",
        "lead_updated",
        "status_changed",
        "activity_logged",
        "marked_lost",
        "marked_contacted",
        "drift_sweep",
        "manual",
      ])
      .default("manual"),
  })
  .strict();

export const BatchScoreBodySchema = z
  .object({
    /** Limit how many leads to enqueue; defaults to all unscored. */
    limit: z.number().int().min(1).max(5000).default(500),
    /** Only recompute leads whose lastScoredAt is older than this (hours). */
    olderThanHours: z.number().int().min(0).max(24 * 30).default(24),
    /** Dealer scope; defaults to the caller's dealer. */
    dealerId: z.string().min(1).max(64).optional(),
  })
  .strict();

/* ============================================================
 * Response shapes (for OpenAPI / clients)
 * ============================================================ */

export const ScoreSignalsSchema = z.object({
  hasEmail: z.number().int(),
  hasPhone: z.number().int(),
  vehicleInInventory: z.number().int(),
  budgetSpecified: z.number().int(),
  contactedUnder24h: z.number().int(),
  hasResponded: z.number().int(),
  hasAppointment: z.number().int(),
  hasReplied: z.number().int(),
  highIntentSource: z.number().int(),
  referralOrRepeat: z.number().int(),
  noResponseAfter3Attempts: z.number().int(),
  overdue7Days: z.number().int(),
  unsubscribed: z.number().int(),
  bouncedContact: z.number().int(),
  lowQualitySource: z.number().int(),
  duplicateOfCustomer: z.number().int(),
});

export const ScoreHistoryItemSchema = z.object({
  id: z.string(),
  score: z.number().int().min(0).max(100),
  classification: ClassificationSchema,
  signals: ScoreSignalsSchema,
  modelVersion: z.string(),
  scoredAt: z.string(), // ISO 8601
});

export const ScoreResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  classification: ClassificationSchema,
  signals: ScoreSignalsSchema,
  topSignals: z.array(
    z.object({
      rule: z.string(),
      delta: z.number().int(),
      label: z.string(),
    }),
  ),
  modelVersion: z.string(),
  computeMs: z.number(),
});

export const DistributionBucketSchema = z.object({
  classification: ClassificationSchema,
  count: z.number().int().min(0),
});

export const LeadListItemSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  source: z.string().nullable(),
  status: z.string(),
  currentScore: z.number().int().min(0).max(100),
  classification: ClassificationSchema,
  lastScoredAt: z.string().nullable(),
  assignedTo: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
