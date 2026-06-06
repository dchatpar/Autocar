/**
 * Zod schemas for customer intake + DL scan.
 *
 * Mirrors `apps/mobile/lib/api.ts` → `CreateCustomerPayload`,
 * `DlScanResult`. Keep these in sync.
 */

import { z } from "zod";

/* ============================================================
 * /customers  POST  create
 * ============================================================ */

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalString = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .transform((s) => s)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const CreateCustomerBodySchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: optionalEmail,
  phone: optionalString,
  dlNumber: optionalString,
  dlProvince: optionalString,
  dob: z
    .string()
    .trim()
    .datetime({ message: "dob must be an ISO timestamp" })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  address: z
    .object({
      street: z.string().trim().max(120).optional(),
      city: z.string().trim().max(80).optional(),
      state: z.string().trim().max(40).optional(),
      postalCode: z.string().trim().max(20).optional(),
    })
    .optional(),
  notes: z.string().trim().max(2_000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  creditTier: z
    .enum(["A", "B", "C", "D", "SUBPRIME"])
    .optional(),
});
export type CreateCustomerBody = z.infer<typeof CreateCustomerBodySchema>;

/* ============================================================
 * /customers/scan-dl  POST
 * ============================================================ */

export const ScanDlBodySchema = z.object({
  image: z.string().min(20, "Image payload required").max(8 * 1024 * 1024),
  mimeType: z
    .enum(["image/jpeg", "image/png", "image/webp"])
    .default("image/jpeg"),
});
export type ScanDlBody = z.infer<typeof ScanDlBodySchema>;
