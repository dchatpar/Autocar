/**
 * Vehicle Service — business logic for inventory mutations.
 *
 * Wraps every Prisma mutation in `withAuditContext()` so an
 * ActivityLog row is written for create / update / delete events.
 * Pricing changes and status transitions are also emitted as
 * distinct events (`vehicle.price_changed`, `vehicle.status_changed`).
 */

import type { Prisma, Vehicle, VehicleCondition, VehicleStatus } from "@prisma/client";

import { prisma as defaultPrisma } from "../utils/prisma.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { withAuditContext, logActivity, type AuditContext } from "./activity-logger.service.js";
import { realtimeService } from "./realtime.service.js";

export interface CreateVehicleInput {
  dealerId: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  trim?: string | null;
  bodyStyle?: string | null;
  mileage?: number | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  engine?: string | null;
  condition?: VehicleCondition;
  status?: VehicleStatus;
  stockNumber?: string | null;
  notes?: string | null;
  acquiredAt?: Date | null;
  pricing?: {
    cost?: number | null;
    askingPrice?: number | null;
    internetPrice?: number | null;
    marketValue?: number | null;
    floorPlan?: number | null;
    reconCost?: number | null;
  };
}

export interface UpdateVehicleInput {
  make?: string;
  model?: string;
  year?: number;
  trim?: string | null;
  bodyStyle?: string | null;
  mileage?: number | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  engine?: string | null;
  condition?: VehicleCondition;
  status?: VehicleStatus;
  stockNumber?: string | null;
  notes?: string | null;
  acquiredAt?: Date | null;
}

export const vehicleService = {
  async create(ctx: AuditContext, input: CreateVehicleInput): Promise<Vehicle> {
    if (!input.vin || input.vin.length !== 17) {
      throw new ValidationError("VIN must be exactly 17 characters");
    }
    if (!input.make || !input.model || !input.year) {
      throw new ValidationError("make, model, and year are required");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.vehicle.findFirst({
      where: { dealerId: input.dealerId, vin: input.vin },
    });
    if (existing) {
      throw new ConflictError("A vehicle with this VIN already exists");
    }
    return db.vehicle.create({
      data: {
        dealerId: input.dealerId,
        vin: input.vin,
        make: input.make,
        model: input.model,
        year: input.year,
        trim: input.trim ?? null,
        bodyStyle: input.bodyStyle ?? null,
        mileage: input.mileage ?? null,
        exteriorColor: input.exteriorColor ?? null,
        interiorColor: input.interiorColor ?? null,
        fuelType: input.fuelType ?? null,
        transmission: input.transmission ?? null,
        drivetrain: input.drivetrain ?? null,
        engine: input.engine ?? null,
        condition: input.condition ?? "USED",
        status: input.status ?? "AVAILABLE",
        stockNumber: input.stockNumber ?? null,
        notes: input.notes ?? null,
        acquiredAt: input.acquiredAt ?? null,
        ...(input.pricing
          ? {
              pricing: {
                create: {
                  cost: input.pricing.cost ?? null,
                  askingPrice: input.pricing.askingPrice ?? null,
                  internetPrice: input.pricing.internetPrice ?? null,
                  marketValue: input.pricing.marketValue ?? null,
                  floorPlan: input.pricing.floorPlan ?? null,
                  reconCost: input.pricing.reconCost ?? null,
                },
              },
            }
          : {}),
      },
    });
  },

  async update(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    input: UpdateVehicleInput,
  ): Promise<Vehicle> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
    });
    if (!existing) throw new NotFoundError("Vehicle not found");
    return db.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...(input.make !== undefined ? { make: input.make } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.year !== undefined ? { year: input.year } : {}),
        ...(input.trim !== undefined ? { trim: input.trim } : {}),
        ...(input.bodyStyle !== undefined ? { bodyStyle: input.bodyStyle } : {}),
        ...(input.mileage !== undefined ? { mileage: input.mileage } : {}),
        ...(input.exteriorColor !== undefined
          ? { exteriorColor: input.exteriorColor }
          : {}),
        ...(input.interiorColor !== undefined
          ? { interiorColor: input.interiorColor }
          : {}),
        ...(input.fuelType !== undefined ? { fuelType: input.fuelType } : {}),
        ...(input.transmission !== undefined
          ? { transmission: input.transmission }
          : {}),
        ...(input.drivetrain !== undefined ? { drivetrain: input.drivetrain } : {}),
        ...(input.engine !== undefined ? { engine: input.engine } : {}),
        ...(input.condition !== undefined ? { condition: input.condition } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.stockNumber !== undefined ? { stockNumber: input.stockNumber } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.acquiredAt !== undefined ? { acquiredAt: input.acquiredAt } : {}),
      },
    });
  },

  /**
   * Update pricing. Emits `vehicle.price_changed` as a separate
   * audit event so the timeline can show price history, and pushes
   * a `vehicle:price_changed` event over Socket.IO so dashboards
   * can re-render the asking price without a refresh.
   */
  async updatePricing(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    pricing: NonNullable<CreateVehicleInput["pricing"]>,
  ): Promise<Vehicle> {
    const db = withAuditContext(ctx, defaultPrisma);
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
      include: { pricing: true },
    });
    if (!vehicle) throw new NotFoundError("Vehicle not found");
    const before = vehicle.pricing;
    const after = await db.vehiclePricing.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        cost: pricing.cost ?? null,
        askingPrice: pricing.askingPrice ?? null,
        internetPrice: pricing.internetPrice ?? null,
        marketValue: pricing.marketValue ?? null,
        floorPlan: pricing.floorPlan ?? null,
        reconCost: pricing.reconCost ?? null,
      },
      update: {
        cost: pricing.cost ?? null,
        askingPrice: pricing.askingPrice ?? null,
        internetPrice: pricing.internetPrice ?? null,
        marketValue: pricing.marketValue ?? null,
        floorPlan: pricing.floorPlan ?? null,
        reconCost: pricing.reconCost ?? null,
      },
    });
    await logActivity(ctx, {
      action: "vehicle.price_changed",
      entityType: "vehicle",
      entityId: vehicleId,
      before,
      after,
    });
    realtimeService.emitVehiclePriceChanged(dealerId, {
      vehicleId,
      oldPrice: before?.askingPrice ?? null,
      newPrice: after.askingPrice ?? null,
    });
    return vehicle;
  },

  /**
   * Move a vehicle through the lifecycle (AVAILABLE → PENDING → SOLD,
   * etc). Emits `vehicle.status_changed`. When the new status is
   * `SOLD`, also emits `vehicle:sold` to the dealer's room.
   */
  async changeStatus(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    newStatus: VehicleStatus,
  ): Promise<Vehicle> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
    });
    if (!existing) throw new NotFoundError("Vehicle not found");
    if (existing.status === newStatus) return existing;
    const updated = await db.vehicle.update({
      where: { id: vehicleId },
      data: { status: newStatus },
    });
    await logActivity(ctx, {
      action: "vehicle.status_changed",
      entityType: "vehicle",
      entityId: vehicleId,
      before: { status: existing.status },
      after: { status: updated.status },
    });
    if (updated.status === "SOLD") {
      realtimeService.emitVehicleSold(dealerId, {
        vehicleId: updated.id,
        dealId: "",
        vin: updated.vin,
      });
    }
    return updated;
  },

  /**
   * Log a media upload event. VehicleMedia is a child record; the
   * audit trail is best captured as a custom event so the UI can
   * show "12 photos added" without a row per file.
   */
  async logMediaUploaded(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    payload: { count: number; types: string[] },
  ): Promise<void> {
    if (ctx.dealerId && ctx.dealerId !== dealerId) {
      throw new ForbiddenError("Cross-tenant write blocked");
    }
    await logActivity(
      { ...ctx, dealerId },
      {
        action: "vehicle.media_uploaded",
        entityType: "vehicle",
        entityId: vehicleId,
        after: payload,
      },
    );
  },

  async delete(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    actor: { role: string },
  ): Promise<Vehicle> {
    if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
      throw new ForbiddenError("Only admins and managers can delete vehicles");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
    });
    if (!existing) throw new NotFoundError("Vehicle not found");
    return db.vehicle.delete({ where: { id: vehicleId } });
  },

  /**
   * List vehicles for a dealer with optional filters and cursor pagination.
   */
  async list(
    dealerId: string,
    filters: {
      status?: VehicleStatus | null;
      condition?: VehicleCondition | null;
      make?: string | null;
      model?: string | null;
      yearMin?: number | null;
      yearMax?: number | null;
      priceMin?: number | null;
      priceMax?: number | null;
      cursor?: string | null;
      limit?: number;
    },
  ): Promise<{ data: Vehicle[]; pagination: { hasMore: boolean; cursor: string | null } }> {
    const where: Prisma.VehicleWhereInput = { dealerId };
    if (filters.status) where.status = filters.status;
    if (filters.condition) where.condition = filters.condition;
    if (filters.make) where.make = { contains: filters.make, mode: "insensitive" };
    if (filters.model) where.model = { contains: filters.model, mode: "insensitive" };
    if (filters.yearMin || filters.yearMax) {
      where.year = {};
      if (filters.yearMin) (where.year as Prisma.IntFilter).gte = filters.yearMin;
      if (filters.yearMax) (where.year as Prisma.IntFilter).lte = filters.yearMax;
    }

    // Price filtering via join on pricing
    if (filters.priceMin || filters.priceMax) {
      const priceWhere: Prisma.VehiclePricingWhereInput = {};
      if (filters.priceMin) priceWhere.askingPrice = { gte: filters.priceMin };
      if (filters.priceMax) priceWhere.askingPrice = { ...(priceWhere.askingPrice as Record<string, unknown> ?? {}), lte: filters.priceMax };
      where.pricing = { is: priceWhere };
    }

    const limit = filters.limit ?? 20;
    const vehicles = await defaultPrisma.vehicle.findMany({
      where,
      include: { pricing: true, media: { where: { isPrimary: true }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
    });

    const hasMore = vehicles.length > limit;
    if (hasMore) vehicles.pop();
    const cursor = hasMore && vehicles.length > 0 ? vehicles[vehicles.length - 1]?.id ?? null : null;

    return { data: vehicles, pagination: { hasMore, cursor } };
  },

  /**
   * Get a vehicle by ID with full relations.
   */
  async getById(dealerId: string, vehicleId: string): Promise<Vehicle & { pricing: unknown; media: unknown[] }> {
    const vehicle = await defaultPrisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
      include: { pricing: true, media: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] } },
    });
    if (!vehicle) throw new NotFoundError("Vehicle not found");
    return vehicle as Vehicle & { pricing: unknown; media: unknown[] };
  },

  /**
   * VIN lookup — check if a VIN already exists in the dealer's inventory.
   */
  async lookupVin(dealerId: string, vin: string): Promise<Vehicle | null> {
    return defaultPrisma.vehicle.findFirst({
      where: { dealerId, vin: vin.toUpperCase() },
    });
  },

  /**
   * Add media to a vehicle (photo/video).
   */
  async addMedia(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    media: Array<{
      s3Key: string;
      cdnUrl?: string | null;
      type?: "PHOTO" | "VIDEO" | "SPIN360";
      sortOrder?: number;
      isPrimary?: boolean;
    }>,
  ): Promise<void> {
    if (ctx.dealerId && ctx.dealerId !== dealerId) {
      throw new ForbiddenError("Cross-tenant write blocked");
    }
    const vehicle = await defaultPrisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
    });
    if (!vehicle) throw new NotFoundError("Vehicle not found");

    await defaultPrisma.vehicleMedia.createMany({
      data: media.map((m) => ({
        vehicleId,
        dealerId,
        s3Key: m.s3Key,
        cdnUrl: m.cdnUrl ?? null,
        type: m.type ?? "PHOTO",
        sortOrder: m.sortOrder ?? 0,
        isPrimary: m.isPrimary ?? false,
      })),
    });

    await logActivity({ ...ctx, dealerId }, {
      action: "vehicle.media_added",
      entityType: "vehicle",
      entityId: vehicleId,
      after: { count: media.length },
    });
  },

  /**
   * Delete a media item.
   */
  async deleteMedia(
    ctx: AuditContext,
    dealerId: string,
    mediaId: string,
  ): Promise<void> {
    const media = await defaultPrisma.vehicleMedia.findFirst({
      where: { id: mediaId, dealerId },
    });
    if (!media) throw new NotFoundError("Media not found");

    if (ctx.dealerId && ctx.dealerId !== dealerId) {
      throw new ForbiddenError("Cross-tenant write blocked");
    }

    await defaultPrisma.vehicleMedia.delete({ where: { id: mediaId } });

    await logActivity({ ...ctx, dealerId }, {
      action: "vehicle.media_deleted",
      entityType: "vehicle",
      entityId: media.vehicleId,
      after: { mediaId },
    });
  },

  /**
   * Syndicate a vehicle to a listing channel. Logs the attempt.
   */
  async syndicate(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    channel: string,
  ): Promise<{ externalId: string | null; status: string }> {
    if (ctx.dealerId && ctx.dealerId !== dealerId) {
      throw new ForbiddenError("Cross-tenant write blocked");
    }
    const vehicle = await defaultPrisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
    });
    if (!vehicle) throw new NotFoundError("Vehicle not found");

    // Stub: in production this would call the actual syndication API
    // (AutoTrader, CarGurus, etc.). We log the attempt and return a
    // synthetic response.
    const externalId = `stub_${channel.toLowerCase()}_${Date.now().toString(36)}`;

    await defaultPrisma.syndicationLog.create({
      data: {
        vehicleId,
        dealerId,
        channel: channel as unknown as import("@prisma/client").SyndicationChannel,
        status: "synced",
        externalId,
        lastSynced: new Date(),
      },
    });

    await logActivity({ ...ctx, dealerId }, {
      action: "vehicle.syndicated",
      entityType: "vehicle",
      entityId: vehicleId,
      after: { channel, externalId },
    });

    return { externalId, status: "synced" };
  },
};
