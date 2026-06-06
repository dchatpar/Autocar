/**
 * Zod schemas for the activity-log endpoints.
 *
 * All bodies and query strings are validated through these schemas
 * (via the `validateBody` / `validateQuery` helpers) before reaching
 * the routes.
 */

import { z } from "zod";

/* ============================================================
 * Common
 * ============================================================ */

export const EntityTypeSchema = z.enum([
  "lead",
  "customer",
  "vehicle",
  "deal",
  "user",
  "invoice",
  "expense",
  "test_drive",
  "appointment",
  "communication",
  "document",
  "agent",
  "integration",
  "settings",
]);

export const AnomalySeveritySchema = z.enum(["low", "medium", "high"]);

/* ============================================================
 * GET /activity-logs — list
 * ============================================================ */

export const ListActivityLogsQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  anomaly: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
  cursor: z.string().min(1).optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Math.min(Math.max(parseInt(v, 10), 1), 200))
    .optional(),
});

export type ListActivityLogsQuery = z.infer<typeof ListActivityLogsQuerySchema>;

/* ============================================================
 * GET /activity-logs/:id
 * ============================================================ */

export const ActivityLogIdParamSchema = z.object({
  id: z.string().min(1).max(64),
});

/* ============================================================
 * GET /activity-logs/stats
 * ============================================================ */

export const StatsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/* ============================================================
 * GET /activity-logs/anomalies
 * ============================================================ */

export const AnomaliesQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Math.min(Math.max(parseInt(v, 10), 1), 500))
    .optional(),
});

/* ============================================================
 * GET /entities/:type/:id/trail
 * ============================================================ */

export const TrailParamsSchema = z.object({
  type: EntityTypeSchema,
  id: z.string().min(1).max(64),
});

export const TrailQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Math.min(Math.max(parseInt(v, 10), 1), 200))
    .optional(),
});

/* ============================================================
 * POST /activity-logs/export
 * ============================================================ */

export const ExportBodySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  format: z.enum(["csv", "json"]).default("csv"),
  userId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  anomalyOnly: z.boolean().default(false),
  includeSnapshots: z.boolean().default(false),
});

export type ExportBody = z.infer<typeof ExportBodySchema>;
