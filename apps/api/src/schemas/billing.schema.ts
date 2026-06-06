/**
 * Zod schemas for /api/billing/* routes.
 *
 * Plan enum matches Prisma's SubscriptionPlan. We keep these loose at
 * the edge (only required fields are required) so the service layer
 * can be the single source of business-logic validation.
 */

import { z } from "zod";

export const SubscriptionPlanSchema = z.enum([
  "STARTER",
  "GROWTH",
  "PRO",
  "ENTERPRISE",
]);
export type SubscriptionPlanInput = z.infer<typeof SubscriptionPlanSchema>;

/* ============================================================
 * POST /billing/create-checkout-session
 * ============================================================ */

export const CreateCheckoutBodySchema = z.object({
  plan: SubscriptionPlanSchema,
  successUrl: z
    .string()
    .url("successUrl must be a valid URL")
    .optional()
    .describe(
      "Override the success redirect URL. Defaults to the success page on the app origin.",
    ),
  cancelUrl: z
    .string()
    .url("cancelUrl must be a valid URL")
    .optional()
    .describe(
      "Override the cancel redirect URL. Defaults to the cancel page on the app origin.",
    ),
});
export type CreateCheckoutBody = z.infer<typeof CreateCheckoutBodySchema>;

/* ============================================================
 * POST /billing/create-portal-session
 * ============================================================ */

export const CreatePortalBodySchema = z.object({
  returnUrl: z
    .string()
    .url("returnUrl must be a valid URL")
    .optional()
    .describe(
      "Override the return URL. Defaults to /settings/billing on the app origin.",
    ),
});
export type CreatePortalBody = z.infer<typeof CreatePortalBodySchema>;

/* ============================================================
 * POST /billing/subscription/upgrade
 * ============================================================ */

export const UpgradeBodySchema = z.object({
  plan: SubscriptionPlanSchema,
});
export type UpgradeBody = z.infer<typeof UpgradeBodySchema>;

/* ============================================================
 * GET /billing/invoices
 * ============================================================ */

export const ListInvoicesQuerySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default(24),
});
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>;

/* ============================================================
 * GET /billing/usage
 * ============================================================ */

export const UsageQuerySchema = z.object({}).strict();
export type UsageQuery = z.infer<typeof UsageQuerySchema>;
