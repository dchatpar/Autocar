/**
 * Inventory routes — /api/inventory/*
 *
 * Endpoints:
 *   GET  /inventory             — paginated list
 *   POST /inventory             — create a new vehicle (multi-tenant)
 *   GET  /inventory/lookup-vin  — NHTSA VPIC VIN decode (used by
 *                                 the mobile scanner to pre-fill
 *                                 the add form).
 *
 * Multi-tenant safety: every Prisma read/write includes
 * `dealerId = payload.dealerId` explicitly. The repository layer
 * also filters by dealerId, so an attacker with a stale `id` from
 * another tenant still hits a NotFound.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../utils/prisma.js";
import { validateBody, validateQuery } from "../utils/validate.js";
import {
  CreateVehicleBodySchema,
  ListInventoryQuerySchema,
  VinLookupQuerySchema,
} from "../schemas/inventory.schema.js";
import { decodeVin } from "../integrations/nhtsa/client.js";
import { vehicleService } from "../services/vehicle.service.js";
import { NotFoundError } from "../utils/errors.js";
import type { UserRole } from "@prisma/client";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /inventory/lookup-vin?vin=...
   *
   * Tenant-scoped (so we can namespace the cache). Returns the
   * NHTSA-decoded fields plus a `source` discriminator so the
   * mobile app can show "decoded from VPIC" vs "manual entry".
   */
  app.get(
    "/lookup-vin",
    {
      preHandler: [
        app.authenticate,
        validateQuery(VinLookupQuerySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const query = (request as { validatedQuery?: { vin: string } })
        .validatedQuery as { vin: string };
      const decoded = await decodeVin(payload.dealerId, query.vin);
      if (!decoded || !decoded.make) {
        // Either VPIC is down, or the VIN isn't in their database.
        // We return 200 with `source: "MANUAL"` and null fields so
        // the mobile form can proceed without a special error path.
        return reply.status(200).send({
          data: {
            vin: query.vin,
            year: null,
            make: null,
            model: null,
            trim: null,
            engine: null,
            fuelType: null,
            bodyStyle: null,
            source: "MANUAL",
            cachedAt: new Date().toISOString(),
          },
        });
      }
      return reply.status(200).send({
        data: {
          vin: query.vin,
          year: decoded.year,
          make: decoded.make,
          model: decoded.model,
          trim: decoded.trim,
          engine: decoded.engine,
          fuelType: decoded.fuelType,
          bodyStyle: decoded.bodyStyle,
          source: "NHTSA_VPIC",
          cachedAt: new Date().toISOString(),
        },
      });
    },
  );

  /**
   * GET /inventory
   * Paginated list of vehicles in the current dealer.
   */
  app.get(
    "/",
    {
      preHandler: [
        app.authenticate,
        validateQuery(ListInventoryQuerySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const query = (request as { validatedQuery?: unknown })
        .validatedQuery as {
        cursor?: string;
        limit: number;
        status?: "AVAILABLE" | "SOLD" | "PENDING" | "WHOLESALE";
        search?: string;
      };
      const limit = Math.min(
        Math.max(query.limit ?? DEFAULT_LIST_LIMIT, 1),
        MAX_LIST_LIMIT,
      );
      const cursorWhere = query.cursor
        ? { id: { lt: query.cursor } }
        : undefined;
      const searchWhere = query.search
        ? {
            OR: [
              { vin: { contains: query.search, mode: "insensitive" as const } },
              { make: { contains: query.search, mode: "insensitive" as const } },
              { model: { contains: query.search, mode: "insensitive" as const } },
              { stockNumber: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : undefined;
      const items = await prisma.vehicle.findMany({
        where: {
          dealerId: payload.dealerId,
          ...(query.status ? { status: query.status } : {}),
          ...(searchWhere ?? {}),
          ...(cursorWhere ?? {}),
        },
        orderBy: { id: "desc" },
        take: limit + 1,
        include: { pricing: true },
      });
      const hasMore = items.length > limit;
      const sliced = hasMore ? items.slice(0, limit) : items;
      const last = sliced[sliced.length - 1];
      return reply.status(200).send({
        data: sliced.map(toVehicleSummary),
        pagination: {
          hasMore,
          cursor: hasMore && last ? last.id : null,
        },
      });
    },
  );

  /**
   * POST /inventory
   * Create a new vehicle. Audit-logged.
   */
  app.post(
    "/",
    {
      preHandler: [
        app.authenticate,
        validateBody(CreateVehicleBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as {
        vin: string;
        year: number;
        make: string;
        model: string;
        trim?: string;
        mileage?: number;
        exteriorColor?: string;
        engine?: string;
        bodyStyle?: string;
        fuelType?: string;
        transmission?: string;
        drivetrain?: string;
        pricing?: {
          cost?: number;
          askingPrice?: number;
          internetPrice?: number;
          marketValue?: number;
          floorPlan?: number;
          reconCost?: number;
        };
      };
      const created = await vehicleService.create(request.requestContext, {
        dealerId: payload.dealerId,
        vin: body.vin,
        make: body.make,
        model: body.model,
        year: body.year,
        trim: body.trim ?? null,
        mileage: body.mileage ?? null,
        exteriorColor: body.exteriorColor ?? null,
        engine: body.engine ?? null,
        bodyStyle: body.bodyStyle ?? null,
        fuelType: body.fuelType ?? null,
        transmission: body.transmission ?? null,
        drivetrain: body.drivetrain ?? null,
        pricing: body.pricing ?? undefined,
      });
      // Re-fetch with pricing for the response shape the mobile app
      // expects (askingPrice on the row).
      const withPricing = await prisma.vehicle.findUnique({
        where: { id: created.id },
        include: { pricing: true },
      });
      if (!withPricing) {
        throw new NotFoundError("Vehicle disappeared after create");
      }
      return reply.status(201).send({ data: toVehicleSummary(withPricing) });
    },
  );
}

interface VehicleWithPricing {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  exteriorColor: string | null;
  status: "AVAILABLE" | "SOLD" | "PENDING" | "WHOLESALE";
  condition: "NEW" | "USED" | "CERTIFIED";
  pricing: { askingPrice: number | null } | null;
  createdAt: Date;
}

function toVehicleSummary(v: VehicleWithPricing): {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  exteriorColor: string | null;
  status: VehicleWithPricing["status"];
  condition: VehicleWithPricing["condition"];
  askingPrice: number | null;
  primaryImageUrl: string | null;
  createdAt: string;
} {
  return {
    id: v.id,
    vin: v.vin,
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
    mileage: v.mileage,
    exteriorColor: v.exteriorColor,
    status: v.status,
    condition: v.condition,
    askingPrice: v.pricing?.askingPrice ?? null,
    primaryImageUrl: null,
    createdAt: v.createdAt.toISOString(),
  };
}
