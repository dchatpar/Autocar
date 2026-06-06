/**
 * Zod schemas for inventory + VIN lookup.
 *
 * Mirrors `apps/mobile/lib/api.ts` → `CreateVehiclePayload`,
 * `VinLookupResult`. Keep these in sync when adding fields.
 */

import { z } from "zod";

/* ============================================================
 * /inventory/lookup-vin?vin=...
 * ============================================================ */

export const VinLookupQuerySchema = z.object({
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .length(17, "VIN must be exactly 17 characters")
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Invalid VIN format"),
});
export type VinLookupQuery = z.infer<typeof VinLookupQuerySchema>;

/* ============================================================
 * /inventory  POST  create
 * ============================================================ */

const numericString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Must be a number")
  .transform((s) => Number(s))
  .optional();

const optionalString = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .transform((s) => s)
  .optional();

export const CreateVehicleBodySchema = z.object({
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .length(17, "VIN must be exactly 17 characters")
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Invalid VIN format"),
  year: z.coerce
    .number()
    .int()
    .min(1900, "Year must be 1900 or later")
    .max(2100, "Year must be 2100 or earlier"),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  trim: optionalString,
  mileage: z.coerce.number().int().min(0).max(2_000_000).optional(),
  exteriorColor: optionalString,
  engine: optionalString,
  bodyStyle: optionalString,
  fuelType: optionalString,
  transmission: optionalString,
  drivetrain: optionalString,
  pricing: z
    .object({
      cost: z.coerce.number().min(0).optional(),
      askingPrice: z.coerce.number().min(0).optional(),
      internetPrice: z.coerce.number().min(0).optional(),
      marketValue: z.coerce.number().min(0).optional(),
      floorPlan: z.coerce.number().min(0).optional(),
      reconCost: z.coerce.number().min(0).optional(),
    })
    .optional(),
});
export type CreateVehicleBody = z.infer<typeof CreateVehicleBodySchema>;

/* ============================================================
 * /inventory  GET  list
 * ============================================================ */

export const ListInventoryQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z
    .enum(["AVAILABLE", "SOLD", "PENDING", "WHOLESALE"])
    .optional(),
  search: z.string().trim().min(1).max(120).optional(),
});
export type ListInventoryQuery = z.infer<typeof ListInventoryQuerySchema>;
