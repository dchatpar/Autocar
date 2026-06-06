/**
 * Zod schemas for the lead routing engine.
 *
 * Routing decisions are stored as `LeadRoutingLog` rows; this file
 * defines the input/output shapes consumed by `routeLead` and exposed
 * to the settings UI.
 */

import { z } from "zod";

/* ============================================================
 * Routing strategies
 * ============================================================ */

export const RoutingStrategySchema = z.enum([
  "ROUND_ROBIN",
  "LOAD_BALANCED",
  "SOURCE_BASED",
  "GEOGRAPHIC",
  "VEHICLE_MATCH",
  "AI_SCORED",
]);
export type RoutingStrategy = z.infer<typeof RoutingStrategySchema>;

export const RepAvailabilitySchema = z.enum([
  "AVAILABLE",
  "AWAY",
  "OFF_DUTY",
]);
export type RepAvailability = z.infer<typeof RepAvailabilitySchema>;

/* ============================================================
 * Dealer settings — routing shape
 * ============================================================ */

/**
 * `dealer.settings` is a JSON blob. The lead router reads its routing
 * config from `dealer.settings.routing`. This schema validates that
 * sub-document. Defaults are applied at the service layer.
 */
export const DealerRoutingSettingsSchema = z
  .object({
    strategy: RoutingStrategySchema.default("LOAD_BALANCED"),
    /** Optional override chain. Higher index = higher priority. */
    priority: z
      .array(RoutingStrategySchema)
      .default(["VEHICLE_MATCH", "SOURCE_BASED", "LOAD_BALANCED"]),
    /** When strategy=SOURCE_BASED — maps source key (e.g. "meta_lead_ad") to repId. */
    source_routing: z.record(z.string()).default({}),
    /** Rep availability overrides — maps repId to availability. */
    rep_availability: z.record(RepAvailabilitySchema).default({}),
    /** Map of Meta page_id → dealerId. Used to disambiguate the dealer. */
    meta_page_id: z.string().optional(),
    /** Optional default dealer when no page mapping is present (dev only). */
    default_dealer_id: z.string().optional(),
  })
  .default({});
export type DealerRoutingSettings = z.infer<typeof DealerRoutingSettingsSchema>;

/* ============================================================
 * Routing decision — the output of routeLead
 * ============================================================ */

export const RoutingDecisionSchema = z.object({
  assignedTo: z.string().nullable(),
  reason: z.string(),
  strategy: RoutingStrategySchema,
  alternativeReps: z.array(z.string()).default([]),
  candidateReps: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      load: z.number().int().nonnegative().optional(),
    }),
  ),
  responseTimeMs: z.number().int().nonnegative(),
});
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

/* ============================================================
 * Routing settings — PATCH /settings/routing
 * ============================================================ */

export const UpdateRoutingSettingsSchema = z
  .object({
    strategy: RoutingStrategySchema.optional(),
    priority: z.array(RoutingStrategySchema).optional(),
    source_routing: z.record(z.string()).optional(),
    rep_availability: z.record(RepAvailabilitySchema).optional(),
  })
  .refine(
    (v) =>
      v.strategy !== undefined ||
      v.priority !== undefined ||
      v.source_routing !== undefined ||
      v.rep_availability !== undefined,
    { message: "No updatable fields provided" },
  );
export type UpdateRoutingSettingsBody = z.infer<typeof UpdateRoutingSettingsSchema>;

/* ============================================================
 * Routing log row — for the settings page table
 * ============================================================ */

export const RoutingLogRowSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  leadName: z.string().nullable().optional(),
  strategyUsed: z.string(),
  selectedRepId: z.string().nullable(),
  selectedRepName: z.string().nullable().optional(),
  reason: z.string(),
  responseTimeMs: z.number().int(),
  routedAt: z.string(), // ISO
  candidateReps: z.array(
    z.object({ id: z.string(), name: z.string().optional() }),
  ),
});
export type RoutingLogRow = z.infer<typeof RoutingLogRowSchema>;
