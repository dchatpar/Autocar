/**
 * Zod schemas for the duplicate-detection & merge API surface.
 *
 * Centralised so the same shape is enforced on every route, and so
 * the auto-trigger hooks (on-customer-create, on-lead-ingest) can
 * reuse the same validators when they build inputs.
 */

import { z } from "zod";

/* ============================================================
 * Field choices for merge
 * ============================================================ */

const MERGEABLE_FIELDS_TUPLE = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "dob",
  "dlNumber",
  "dlProvince",
  "creditTier",
  "notes",
  "tags",
  "address",
] as const;

export const MergeableFieldSchema = z.enum(MERGEABLE_FIELDS_TUPLE);

export const FieldChoiceSchema = z.enum(["master", "duplicate"]);

const fieldChoiceObjectShape: Record<
  (typeof MERGEABLE_FIELDS_TUPLE)[number],
  z.ZodOptional<typeof FieldChoiceSchema>
> = MERGEABLE_FIELDS_TUPLE.reduce(
  (acc, field) => {
    acc[field] = FieldChoiceSchema.optional();
    return acc;
  },
  {} as Record<(typeof MERGEABLE_FIELDS_TUPLE)[number], z.ZodOptional<typeof FieldChoiceSchema>>,
);

export const FieldChoicesSchema = z
  .object(fieldChoiceObjectShape)
  .partial()
  .optional();

/* ============================================================
 * Find duplicates
 * ============================================================ */

export const FindDuplicatesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  minScore: z.coerce.number().min(0).max(1).optional(),
});

/* ============================================================
 * Merge
 * ============================================================ */

export const MergeRequestSchema = z.object({
  masterId: z.string().min(1),
  duplicateId: z.string().min(1),
  fieldChoices: FieldChoicesSchema,
});

/* ============================================================
 * Preview — same body shape as merge but never persists.
 * ============================================================ */

export const PreviewMergeRequestSchema = MergeRequestSchema;

/* ============================================================
 * Dismiss — POST /customers/:id/dismiss-duplicate/:otherId
 * ============================================================ */

export const DismissParamsSchema = z.object({
  id: z.string().min(1),
  otherId: z.string().min(1),
});

/* ============================================================
 * List — GET /customers/duplicates
 * ============================================================ */

export const ListDuplicatesQuerySchema = z.object({
  status: z.enum(["pending", "merged", "dismissed"]).optional(),
  classification: z.enum(["auto_merge", "flag", "not_duplicate"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/* ============================================================
 * Lead find duplicates — same query
 * ============================================================ */

export const LeadFindDuplicatesQuerySchema = FindDuplicatesQuerySchema;
