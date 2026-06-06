/**
 * Inventory Service — business logic for vehicle CRUD operations.
 *
 * All mutations are scoped to dealerId. The service layer wraps Prisma
 * with typed inputs/outputs and emits real-time events via realtimeService.
 */

import type { Prisma, Vehicle, VehicleCondition, VehicleStatus } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { NotFoundError, ConflictError, ValidationError } from "../utils/errors.js";
import { realtimeService } from "./realtime.service.js";
import { logActivity, type AuditContext } from "./activity-logger.service.js";

export interface VehicleWithRelations extends Vehicle {
  pricing?: {
    id: string;
    cost: number | null;
    askingPrice: number | null;
    internetPrice: number | null;
    marketValue: number | null;
    floorPlan: number | null;
    reconCost: number | null;
    updatedAt: Date;
  } | null;
  media?: Array<{
    id: string;
    s3Key: string;
    cdnUrl: string | null;
    type: string;
    sortOrder: number;
    isPrimary: boolean;
  }>;
  syndicationLogs?: Array<{
    id: string;
    channel: string;
    status: string | null;
    lastSynced: Date | null;
  }>;
}

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
  stockNumber?: string | null;
  notes?: string | null;
  acquiredAt?: Date | null;
}

export interface UpdatePricingInput {
  cost?: number | null;
  askingPrice?: number | null;
  internetPrice?: number | null;
  marketValue?: number | null;
  floorPlan?: number | null;
  reconCost?: number | null;
}

export interface ListVehiclesOptions {
  dealerId: string;
  cursor?: string;
  limit?: number;
  status?: VehicleStatus;
  make?: string;
  model?: string;
  year?: number;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}

export interface ListVehiclesResult {
  vehicles: VehicleWithRelations[];
  hasMore: boolean;
  cursor: string | null;
}

export const inventoryService = {
  /**
   * Create a new vehicle. Checks for VIN uniqueness per dealer.
   */
  async create(ctx: AuditContext, input: CreateVehicleInput): Promise<VehicleWithRelations> {
    if (!input.vin || input.vin.length !== 17) {
      throw new ValidationError("VIN must be exactly 17 characters");
    }
    if (!input.make || !input.model || !input.year) {
      throw new ValidationError("make, model, and year are required");
    }

    const existing = await prisma.vehicle.findFirst({
      where: { dealerId: input.dealerId, vin: input.vin },
    });
    if (existing) {
      throw new ConflictError("A vehicle with this VIN already exists");
    }

    const vehicle = await prisma.vehicle.create({
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
      include: { pricing: true },
    });

    await logActivity(ctx, {
      action: "vehicle.created",
      entityType: "vehicle",
      entityId: vehicle.id,
      after: { id: vehicle.id, vin: vehicle.vin, make: vehicle.make, model: vehicle.model },
    });

    return vehicle;
  },

  /**
   * Get a single vehicle by ID with pricing, media, and syndication logs.
   */
  async getById(dealerId: string, vehicleId: string): Promise<VehicleWithRelations> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
      include: {
        pricing: true,
        media: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        },
        syndicationLogs: {
          orderBy: { lastSynced: "desc" },
          take: 10,
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundError("Vehicle not found");
    }

    return vehicle;
  },

  /**
   * List vehicles with filtering and cursor pagination.
   */
  async list(options: ListVehiclesOptions): Promise<ListVehiclesResult> {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);

    // Build where clause
    const where: Prisma.VehicleWhereInput = {
      dealerId: options.dealerId,
    };

    if (options.status) {
      where.status = options.status;
    }
    if (options.make) {
      where.make = { equals: options.make, mode: "insensitive" };
    }
    if (options.model) {
      where.model = { equals: options.model, mode: "insensitive" };
    }
    if (options.year) {
      where.year = options.year;
    }
    if (options.search) {
      where.OR = [
        { vin: { contains: options.search, mode: "insensitive" } },
        { make: { contains: options.search, mode: "insensitive" } },
        { model: { contains: options.search, mode: "insensitive" } },
        { stockNumber: { contains: options.search, mode: "insensitive" } },
      ];
    }
    if (options.cursor) {
      where.id = { lt: options.cursor };
    }

    // Price range filter via pricing join
    if (options.minPrice !== undefined || options.maxPrice !== undefined) {
      where.pricing = {};
      if (options.minPrice !== undefined) {
        where.pricing.askingPrice = { gte: options.minPrice };
      }
      if (options.maxPrice !== undefined) {
        where.pricing.askingPrice = {
          ...(where.pricing.askingPrice as object),
          lte: options.maxPrice,
        };
      }
    }

    const vehicles = await prisma.vehicle.findMany({
      where,
      orderBy: { id: "desc" },
      take: limit + 1,
      include: {
        pricing: true,
        media: {
          where: { isPrimary: true },
          take: 1,
        },
      },
    });

    const hasMore = vehicles.length > limit;
    const results = hasMore ? vehicles.slice(0, limit) : vehicles;
    const lastItem = results[results.length - 1];

    return {
      vehicles: results,
      hasMore,
      cursor: hasMore && lastItem ? lastItem.id : null,
    };
  },

  /**
   * Update vehicle fields.
   */
  async update(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    input: UpdateVehicleInput,
  ): Promise<VehicleWithRelations> {
    const existing = await prisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
    });

    if (!existing) {
      throw new NotFoundError("Vehicle not found");
    }

    const vehicle = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...(input.make !== undefined ? { make: input.make } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.year !== undefined ? { year: input.year } : {}),
        ...(input.trim !== undefined ? { trim: input.trim } : {}),
        ...(input.bodyStyle !== undefined ? { bodyStyle: input.bodyStyle } : {}),
        ...(input.mileage !== undefined ? { mileage: input.mileage } : {}),
        ...(input.exteriorColor !== undefined ? { exteriorColor: input.exteriorColor } : {}),
        ...(input.interiorColor !== undefined ? { interiorColor: input.interiorColor } : {}),
        ...(input.fuelType !== undefined ? { fuelType: input.fuelType } : {}),
        ...(input.transmission !== undefined ? { transmission: input.transmission } : {}),
        ...(input.drivetrain !== undefined ? { drivetrain: input.drivetrain } : {}),
        ...(input.engine !== undefined ? { engine: input.engine } : {}),
        ...(input.condition !== undefined ? { condition: input.condition } : {}),
        ...(input.stockNumber !== undefined ? { stockNumber: input.stockNumber } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.acquiredAt !== undefined ? { acquiredAt: input.acquiredAt } : {}),
      },
      include: { pricing: true },
    });

    await logActivity(ctx, {
      action: "vehicle.updated",
      entityType: "vehicle",
      entityId: vehicleId,
      before: { make: existing.make, model: existing.model },
      after: { make: vehicle.make, model: vehicle.model },
    });

    return vehicle;
  },

  /**
   * Change vehicle status (AVAILABLE/PENDING/SOLD).
   */
  async changeStatus(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    newStatus: VehicleStatus,
  ): Promise<VehicleWithRelations> {
    const existing = await prisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
    });

    if (!existing) {
      throw new NotFoundError("Vehicle not found");
    }

    if (existing.status === newStatus) {
      return this.getById(dealerId, vehicleId);
    }

    const vehicle = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: newStatus },
      include: { pricing: true },
    });

    await logActivity(ctx, {
      action: "vehicle.status_changed",
      entityType: "vehicle",
      entityId: vehicleId,
      before: { status: existing.status },
      after: { status: vehicle.status },
    });

    if (vehicle.status === "SOLD") {
      realtimeService.emitVehicleSold(dealerId, {
        vehicleId: vehicle.id,
        dealId: "",
        vin: vehicle.vin,
      });
    }

    return vehicle;
  },

  /**
   * Set or update vehicle pricing.
   */
  async setPricing(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    pricing: UpdatePricingInput,
  ): Promise<VehicleWithRelations> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
      include: { pricing: true },
    });

    if (!vehicle) {
      throw new NotFoundError("Vehicle not found");
    }

    const updated = await prisma.vehiclePricing.upsert({
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
      before: vehicle.pricing,
      after: updated,
    });

    if (
      vehicle.pricing?.askingPrice !== updated.askingPrice
    ) {
      realtimeService.emitVehiclePriceChanged(dealerId, {
        vehicleId,
        oldPrice: vehicle.pricing?.askingPrice ?? null,
        newPrice: updated.askingPrice ?? null,
      });
    }

    return this.getById(dealerId, vehicleId);
  },

  /**
   * Get vehicle pricing tiers.
   */
  async getPricing(dealerId: string, vehicleId: string): Promise<{ pricing: Prisma.VehiclePricingGetPayload<object> | null }> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
      include: { pricing: true },
    });

    if (!vehicle) {
      throw new NotFoundError("Vehicle not found");
    }

    return { pricing: vehicle.pricing };
  },

  /**
   * Log media upload for a vehicle.
   */
  async addMedia(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    media: Array<{
      s3Key: string;
      cdnUrl?: string | null;
      type?: string;
      sortOrder?: number;
      isPrimary?: boolean;
    }>,
  ): Promise<VehicleWithRelations> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
    });

    if (!vehicle) {
      throw new NotFoundError("Vehicle not found");
    }

    // If any new media is marked as primary, unset existing primary
    const hasNewPrimary = media.some((m) => m.isPrimary);
    if (hasNewPrimary) {
      await prisma.vehicleMedia.updateMany({
        where: { vehicleId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    await prisma.vehicleMedia.createMany({
      data: media.map((m, idx) => ({
        vehicleId,
        dealerId,
        s3Key: m.s3Key,
        cdnUrl: m.cdnUrl ?? null,
        type: (m.type as "PHOTO" | "VIDEO" | "SPIN360") ?? "PHOTO",
        sortOrder: m.sortOrder ?? idx,
        isPrimary: m.isPrimary ?? (hasNewPrimary && idx === 0),
      })),
    });

    await logActivity(ctx, {
      action: "vehicle.media_added",
      entityType: "vehicle",
      entityId: vehicleId,
      after: { count: media.length },
    });

    return this.getById(dealerId, vehicleId);
  },

  /**
   * Delete a media item from a vehicle.
   */
  async deleteMedia(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    mediaId: string,
  ): Promise<void> {
    const media = await prisma.vehicleMedia.findFirst({
      where: { id: mediaId, vehicleId, dealerId },
    });

    if (!media) {
      throw new NotFoundError("Media not found");
    }

    await prisma.vehicleMedia.delete({ where: { id: mediaId } });

    await logActivity(ctx, {
      action: "vehicle.media_deleted",
      entityType: "vehicle",
      entityId: vehicleId,
      after: { mediaId },
    });
  },

  /**
   * Syndicate a vehicle to marketplace channels.
   */
  async syndicate(
    ctx: AuditContext,
    dealerId: string,
    vehicleId: string,
    channels: string[],
  ): Promise<{ logs: Prisma.SyndicationLogGetPayload<object>[] }> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId },
    });

    if (!vehicle) {
      throw new NotFoundError("Vehicle not found");
    }

    const logs: Prisma.SyndicationLogGetPayload<object>[] = [];

    for (const channel of channels) {
      const log = await prisma.syndicationLog.create({
        data: {
          vehicleId,
          dealerId,
          channel: channel as "AUTOTRADER" | "CARGURUS" | "KIJIJI" | "FACEBOOK",
          status: "pending",
        },
      });
      logs.push(log);

      // In production, this would call the actual marketplace API
      // For now, just mark as synced
      await prisma.syndicationLog.update({
        where: { id: log.id },
        data: {
          status: "synced",
          lastSynced: new Date(),
          externalId: `ext_${Date.now()}`,
        },
      });
    }

    await logActivity(ctx, {
      action: "vehicle.syndicated",
      entityType: "vehicle",
      entityId: vehicleId,
      after: { channels, count: channels.length },
    });

    return { logs };
  },

  /**
   * Get syndication logs for a dealer.
   */
  async getSyndicationLogs(
    dealerId: string,
    options?: { vehicleId?: string; limit?: number },
  ): Promise<Prisma.SyndicationLogGetPayload<object>[]> {
    return prisma.syndicationLog.findMany({
      where: {
        dealerId,
        ...(options?.vehicleId ? { vehicleId: options.vehicleId } : {}),
      },
      orderBy: { lastSynced: "desc" },
      take: options?.limit ?? 50,
    });
  },
};

export default inventoryService;
