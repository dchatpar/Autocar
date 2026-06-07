/**
 * Inventory routes — /api/v1/inventory/*
 *
 * Full CRUD for vehicles including:
 *   - POST   /inventory                  — add vehicle
 *   - GET    /inventory                  — list (filter: make, model, year, status, price range)
 *   - GET    /inventory/:id              — get one with pricing, media, syndication
 *   - PUT    /inventory/:id              — update vehicle
 *   - PATCH  /inventory/:id/status        — change status (available/pending/sold)
 *   - POST   /inventory/:id/pricing       — set pricing
 *   - GET    /inventory/:id/pricing       — get pricing tiers
 *   - POST   /inventory/:id/media         — upload photos
 *   - DELETE /inventory/:id/media/:mediaId — delete photo
 *   - POST   /inventory/:id/syndicate    — push to marketplaces
 *   - GET    /inventory/syndication/logs  — syndication history
 *   - POST   /inventory/lookup-vin       — NHTSA VIN decode
 *
 * Multi-tenant: every Prisma query includes dealerId from the JWT.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { UserRole, VehicleStatus } from "@prisma/client";

import { prisma } from "../utils/prisma.js";
import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { inventoryService } from "../services/inventory.service.js";
import { decodeVin } from "../integrations/nhtsa/client.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

/* ============================================================
 * Schemas
 * ============================================================ */

const VehicleIdParamSchema = z.object({
  id: z.string().cuid(),
});

const MediaIdParamSchema = z.object({
  id: z.string().cuid(),
  mediaId: z.string().cuid(),
});

const CreateVehicleSchema = z.object({
  vin: z.string().trim().toUpperCase().length(17),
  year: z.coerce.number().int().min(1900).max(2100),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  trim: z.string().trim().max(60).optional(),
  mileage: z.coerce.number().int().min(0).optional(),
  exteriorColor: z.string().trim().max(40).optional(),
  interiorColor: z.string().trim().max(40).optional(),
  engine: z.string().trim().max(120).optional(),
  bodyStyle: z.string().trim().max(60).optional(),
  fuelType: z.string().trim().max(40).optional(),
  transmission: z.string().trim().max(40).optional(),
  drivetrain: z.string().trim().max(40).optional(),
  condition: z.enum(["NEW", "USED", "CERTIFIED"]).optional(),
  stockNumber: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(500).optional(),
  acquiredAt: z.string().datetime().optional(),
  pricing: z
    .object({
      cost: z.number().min(0).optional(),
      askingPrice: z.number().min(0).optional(),
      internetPrice: z.number().min(0).optional(),
      marketValue: z.number().min(0).optional(),
      floorPlan: z.number().min(0).optional(),
      reconCost: z.number().min(0).optional(),
    })
    .optional(),
});

const UpdateVehicleSchema = z.object({
  make: z.string().trim().min(1).max(60).optional(),
  model: z.string().trim().min(1).max(60).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  trim: z.string().trim().max(60).nullable().optional(),
  mileage: z.coerce.number().int().min(0).nullable().optional(),
  exteriorColor: z.string().trim().max(40).nullable().optional(),
  interiorColor: z.string().trim().max(40).nullable().optional(),
  engine: z.string().trim().max(120).nullable().optional(),
  bodyStyle: z.string().trim().max(60).nullable().optional(),
  fuelType: z.string().trim().max(40).nullable().optional(),
  transmission: z.string().trim().max(40).nullable().optional(),
  drivetrain: z.string().trim().max(40).nullable().optional(),
  condition: z.enum(["NEW", "USED", "CERTIFIED"]).optional(),
  stockNumber: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  acquiredAt: z.string().datetime().nullable().optional(),
});

const StatusChangeSchema = z.object({
  status: z.enum(["AVAILABLE", "PENDING", "SOLD", "WHOLESALE"]),
});

const UpdatePricingSchema = z.object({
  cost: z.number().min(0).nullable().optional(),
  askingPrice: z.number().min(0).nullable().optional(),
  internetPrice: z.number().min(0).nullable().optional(),
  marketValue: z.number().min(0).nullable().optional(),
  floorPlan: z.number().min(0).nullable().optional(),
  reconCost: z.number().min(0).nullable().optional(),
});

const AddMediaSchema = z.object({
  media: z.array(
    z.object({
      s3Key: z.string().min(1),
      cdnUrl: z.string().url().optional(),
      type: z.enum(["PHOTO", "VIDEO", "SPIN360"]).optional(),
      sortOrder: z.number().int().min(0).optional(),
      isPrimary: z.boolean().optional(),
    }),
  ),
});

const SyndicateSchema = z.object({
  channels: z.array(z.enum(["AUTOTRADER", "CARGURUS", "KIJIJI", "FACEBOOK"])).min(1),
});

const ListInventoryQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["AVAILABLE", "PENDING", "SOLD", "WHOLESALE"]).optional(),
  make: z.string().trim().optional(),
  model: z.string().trim().optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  search: z.string().trim().optional(),
});

const VinLookupQuerySchema = z.object({
  vin: z.string().trim().toUpperCase().length(17).regex(/^[A-HJ-NPR-Z0-9]{17}$/),
});

/* ============================================================
 * Helpers
 * ============================================================ */

function requireTenant(request: { tenant?: { dealerId: string; userId: string; role: string } | null }): { dealerId: string; userId: string; role: string } {
  if (!request.tenant) throw new NotFoundError("Tenant context required");
  return request.tenant;
}

function toVehicleResponse(v: {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  engine: string | null;
  bodyStyle: string | null;
  fuelType: string | null;
  transmission: string | null;
  drivetrain: string | null;
  condition: string;
  status: string;
  stockNumber: string | null;
  notes: string | null;
  acquiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pricing?: { askingPrice: number | null; internetPrice: number | null; cost: number | null; marketValue: number | null } | null;
  media?: Array<{ id: string; s3Key: string; cdnUrl: string | null; type: string; sortOrder: number; isPrimary: boolean }>;
  syndicationLogs?: Array<{ id: string; channel: string; status: string | null; lastSynced: Date | null }>;
}) {
  return {
    id: v.id,
    vin: v.vin,
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
    mileage: v.mileage,
    exteriorColor: v.exteriorColor,
    interiorColor: v.interiorColor,
    engine: v.engine,
    bodyStyle: v.bodyStyle,
    fuelType: v.fuelType,
    transmission: v.transmission,
    drivetrain: v.drivetrain,
    condition: v.condition,
    status: v.status,
    stockNumber: v.stockNumber,
    notes: v.notes,
    acquiredAt: v.acquiredAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    pricing: v.pricing
      ? {
          askingPrice: v.pricing.askingPrice,
          internetPrice: v.pricing.internetPrice,
          cost: v.pricing.cost,
          marketValue: v.pricing.marketValue,
        }
      : null,
    media: v.media?.map((m) => ({
      id: m.id,
      url: m.cdnUrl ?? null,
      type: m.type,
      sortOrder: m.sortOrder,
      isPrimary: m.isPrimary,
    })),
    syndicationLogs: v.syndicationLogs?.map((l) => ({
      id: l.id,
      channel: l.channel,
      status: l.status,
      lastSynced: l.lastSynced?.toISOString() ?? null,
    })),
  };
}

/* ============================================================
 * Routes
 * ============================================================ */

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /inventory/lookup-vin
   * Decode VIN using NHTSA API.
   */
  app.post(
    "/lookup-vin",
    {
      preHandler: [app.authenticate, validateBody(VinLookupQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const body = request.body as z.infer<typeof VinLookupQuerySchema>;
      const decoded = await decodeVin(ctx.dealerId, body.vin);

      if (!decoded || !decoded.make) {
        return reply.status(200).send({
          data: {
            vin: body.vin,
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
          vin: body.vin,
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
   * List vehicles with filtering.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListInventoryQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const query = (request as { validatedQuery?: z.infer<typeof ListInventoryQuerySchema> }).validatedQuery ?? { limit: 25 };

      const result = await inventoryService.list({
        dealerId: ctx.dealerId,
        cursor: query.cursor,
        limit: query.limit,
        status: query.status as VehicleStatus | undefined,
        make: query.make,
        model: query.model,
        year: query.year,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        search: query.search,
      });

      return reply.status(200).send({
        data: result.vehicles.map(toVehicleResponse),
        pagination: {
          hasMore: result.hasMore,
          cursor: result.cursor,
        },
      });
    },
  );

  /**
   * POST /inventory
   * Create a new vehicle.
   */
  app.post(
    "/",
    {
      preHandler: [app.authenticate, validateBody(CreateVehicleSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const body = request.body as z.infer<typeof CreateVehicleSchema>;

      const vehicle = await inventoryService.create(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        {
          dealerId: ctx.dealerId,
          vin: body.vin,
          year: body.year,
          make: body.make,
          model: body.model,
          trim: body.trim,
          mileage: body.mileage,
          exteriorColor: body.exteriorColor,
          interiorColor: body.interiorColor,
          engine: body.engine,
          bodyStyle: body.bodyStyle,
          fuelType: body.fuelType,
          transmission: body.transmission,
          drivetrain: body.drivetrain,
          condition: body.condition,
          stockNumber: body.stockNumber,
          notes: body.notes,
          acquiredAt: body.acquiredAt ? new Date(body.acquiredAt) : null,
          pricing: body.pricing,
        },
      );

      return reply.status(201).send({ data: toVehicleResponse(vehicle as Parameters<typeof toVehicleResponse>[0]) });
    },
  );

  /**
   * GET /inventory/:id
   * Get a single vehicle with all relations.
   */
  app.get(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(VehicleIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof VehicleIdParamSchema>;

      const vehicle = await inventoryService.getById(ctx.dealerId, id);

      return reply.status(200).send({ data: toVehicleResponse(vehicle as Parameters<typeof toVehicleResponse>[0]) });
    },
  );

  /**
   * PUT /inventory/:id
   * Update vehicle fields.
   */
  app.put(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(VehicleIdParamSchema), validateBody(UpdateVehicleSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof VehicleIdParamSchema>;
      const body = request.body as z.infer<typeof UpdateVehicleSchema>;

      const vehicle = await inventoryService.update(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        ctx.dealerId,
        id,
        {
          ...body,
          acquiredAt: body.acquiredAt ? new Date(body.acquiredAt) : undefined,
        },
      );

      return reply.status(200).send({ data: toVehicleResponse(vehicle as Parameters<typeof toVehicleResponse>[0]) });
    },
  );

  /**
   * PATCH /inventory/:id/status
   * Change vehicle status.
   */
  app.patch(
    "/:id/status",
    {
      preHandler: [app.authenticate, validateParams(VehicleIdParamSchema), validateBody(StatusChangeSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof VehicleIdParamSchema>;
      const body = request.body as z.infer<typeof StatusChangeSchema>;

      const vehicle = await inventoryService.changeStatus(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        ctx.dealerId,
        id,
        body.status as VehicleStatus,
      );

      return reply.status(200).send({ data: toVehicleResponse(vehicle as Parameters<typeof toVehicleResponse>[0]) });
    },
  );

  /**
   * GET /inventory/:id/pricing
   * Get vehicle pricing tiers.
   */
  app.get(
    "/:id/pricing",
    {
      preHandler: [app.authenticate, validateParams(VehicleIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof VehicleIdParamSchema>;

      const result = await inventoryService.getPricing(ctx.dealerId, id);

      return reply.status(200).send({
        data: {
          cost: result.pricing?.cost ?? null,
          askingPrice: result.pricing?.askingPrice ?? null,
          internetPrice: result.pricing?.internetPrice ?? null,
          marketValue: result.pricing?.marketValue ?? null,
          floorPlan: result.pricing?.floorPlan ?? null,
          reconCost: result.pricing?.reconCost ?? null,
          updatedAt: result.pricing?.updatedAt?.toISOString() ?? null,
        },
      });
    },
  );

  /**
   * POST /inventory/:id/pricing
   * Set or update vehicle pricing.
   */
  app.post(
    "/:id/pricing",
    {
      preHandler: [app.authenticate, validateParams(VehicleIdParamSchema), validateBody(UpdatePricingSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof VehicleIdParamSchema>;
      const body = request.body as z.infer<typeof UpdatePricingSchema>;

      const vehicle = await inventoryService.setPricing(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        ctx.dealerId,
        id,
        body,
      );

      return reply.status(200).send({ data: toVehicleResponse(vehicle as Parameters<typeof toVehicleResponse>[0]) });
    },
  );

  /**
   * POST /inventory/:id/media
   * Add media to vehicle.
   */
  app.post(
    "/:id/media",
    {
      preHandler: [app.authenticate, validateParams(VehicleIdParamSchema), validateBody(AddMediaSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof VehicleIdParamSchema>;
      const body = request.body as z.infer<typeof AddMediaSchema>;

      const vehicle = await inventoryService.addMedia(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        ctx.dealerId,
        id,
        body.media,
      );

      return reply.status(200).send({ data: toVehicleResponse(vehicle as Parameters<typeof toVehicleResponse>[0]) });
    },
  );

  /**
   * DELETE /inventory/:id/media/:mediaId
   * Delete a media item.
   */
  app.delete(
    "/:id/media/:mediaId",
    {
      preHandler: [app.authenticate, validateParams(MediaIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id, mediaId } = request.params as z.infer<typeof MediaIdParamSchema>;

      await inventoryService.deleteMedia(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        ctx.dealerId,
        id,
        mediaId,
      );

      return reply.status(204).send();
    },
  );

  /**
   * POST /inventory/:id/syndicate
   * Push vehicle to marketplace channels.
   */
  app.post(
    "/:id/syndicate",
    {
      preHandler: [app.authenticate, validateParams(VehicleIdParamSchema), validateBody(SyndicateSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof VehicleIdParamSchema>;
      const body = request.body as z.infer<typeof SyndicateSchema>;

      const result = await inventoryService.syndicate(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        ctx.dealerId,
        id,
        body.channels,
      );

      return reply.status(200).send({
        data: {
          logs: result.logs.map((l) => ({
            id: l.id,
            channel: l.channel,
            status: l.status,
            lastSynced: l.lastSynced?.toISOString() ?? null,
          })),
        },
      });
    },
  );

  /**
   * GET /inventory/syndication/logs
   * Get syndication history.
   */
  app.get(
    "/syndication/logs",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const query = (request as { validatedQuery?: { vehicleId?: string; limit?: number } }).validatedQuery ?? {};

      const logs = await inventoryService.getSyndicationLogs(ctx.dealerId, {
        vehicleId: query.vehicleId,
        limit: query.limit ?? 50,
      });

      return reply.status(200).send({
        data: logs.map((l) => ({
          id: l.id,
          vehicleId: l.vehicleId,
          channel: l.channel,
          status: l.status,
          externalId: l.externalId,
          lastSynced: l.lastSynced?.toISOString() ?? null,
          errorMsg: l.errorMsg,
          createdAt: l.createdAt.toISOString(),
        })),
      });
    },
  );
}

export default inventoryRoutes;
