/**
 * Deal Service — business logic for deal lifecycle.
 *
 * Wraps every Prisma mutation in `withAuditContext()` so an
 * ActivityLog row is written for the event. Stage transitions and
 * delivery are emitted as distinct, human-readable events in
 * addition to the wrapper's `deal.updated` row.
 */

import type { Deal, DealStatus, DealType, Prisma } from "@prisma/client";

import { prisma as defaultPrisma } from "../utils/prisma.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { withAuditContext, logActivity, type AuditContext } from "./activity-logger.service.js";
import { realtimeService } from "./realtime.service.js";
import { notificationService } from "./notification.service.js";

export interface CreateDealInput {
  dealerId: string;
  customerId: string;
  vehicleId?: string | null;
  leadId?: string | null;
  assignedToId?: string | null;
  dealType?: DealType;
  status?: DealStatus;
}

export interface UpdateDealInput {
  vehicleId?: string | null;
  assignedToId?: string | null;
  dealType?: DealType;
  status?: DealStatus;
}

export interface UpdateTermsInput {
  salePrice?: number | null;
  tradeValue?: number | null;
  tradePayoff?: number | null;
  downPayment?: number | null;
  taxAmount?: number | null;
  feeTotal?: number | null;
  financedAmount?: number | null;
  rate?: number | null;
  termMonths?: number | null;
  paymentAmount?: number | null;
  lender?: string | null;
  frontGross?: number | null;
  backGross?: number | null;
}

const VALID_TRANSITIONS: Record<DealStatus, ReadonlyArray<DealStatus>> = {
  WORKING: ["PENDING_FINANCE", "UNWOUND"],
  PENDING_FINANCE: ["APPROVED", "WORKING", "UNWOUND"],
  APPROVED: ["DELIVERED", "PENDING_FINANCE", "UNWOUND"],
  DELIVERED: [],
  UNWOUND: ["WORKING"],
};

export const dealService = {
  async create(ctx: AuditContext, input: CreateDealInput): Promise<Deal> {
    if (!input.customerId) {
      throw new ValidationError("customerId is required");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    return db.deal.create({
      data: {
        dealerId: input.dealerId,
        customerId: input.customerId,
        vehicleId: input.vehicleId ?? null,
        leadId: input.leadId ?? null,
        assignedToId: input.assignedToId ?? null,
        dealType: input.dealType ?? "RETAIL",
        status: input.status ?? "WORKING",
      },
    });
  },

  async update(
    ctx: AuditContext,
    dealerId: string,
    dealId: string,
    input: UpdateDealInput,
  ): Promise<Deal> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.deal.findFirst({ where: { id: dealId, dealerId } });
    if (!existing) throw new NotFoundError("Deal not found");
    return db.deal.update({
      where: { id: dealId },
      data: {
        ...(input.vehicleId !== undefined ? { vehicleId: input.vehicleId } : {}),
        ...(input.assignedToId !== undefined
          ? { assignedToId: input.assignedToId }
          : {}),
        ...(input.dealType !== undefined ? { dealType: input.dealType } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
  },

  /**
   * Move a deal to a new stage. Validates the transition against
   * `VALID_TRANSITIONS` to keep the lifecycle sane, and emits a
   * `deal.stage_changed` event for the trail. Also pushes a live
   * `deal:stage_changed` Socket.IO event to the dealer's room.
   */
  async changeStage(
    ctx: AuditContext,
    dealerId: string,
    dealId: string,
    newStage: DealStatus,
    actor: { id: string; role: string },
  ): Promise<Deal> {
    if (actor.role !== "ADMIN" && actor.role !== "MANAGER" && actor.role !== "FINANCE") {
      throw new ForbiddenError("Only finance / management can change deal stages");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.deal.findFirst({ where: { id: dealId, dealerId } });
    if (!existing) throw new NotFoundError("Deal not found");
    if (existing.status === newStage) return existing;
    const allowed = VALID_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(newStage)) {
      throw new ValidationError(
        `Cannot transition deal from ${existing.status} to ${newStage}`,
      );
    }
    const updated = await db.deal.update({
      where: { id: dealId },
      data: { status: newStage },
    });
    await logActivity(ctx, {
      action: "deal.stage_changed",
      entityType: "deal",
      entityId: dealId,
      before: { status: existing.status },
      after: { status: updated.status },
      metadata: { changedBy: actor.id },
    });
    realtimeService.emitDealStageChanged(dealerId, {
      dealId,
      from: existing.status,
      to: updated.status,
      vehicleId: updated.vehicleId,
      customerId: updated.customerId,
    });
    return updated;
  },

  /**
   * Mark a deal as DELIVERED. Records the delivery timestamp and
   * also flips the vehicle status to SOLD. Emits `deal:delivered`
   * and `vehicle:sold` over Socket.IO, and writes a DEAL_DELIVERED
   * notification to the assigned user.
   */
  async markDelivered(
    ctx: AuditContext,
    dealerId: string,
    dealId: string,
    actor: { id: string; role: string },
  ): Promise<Deal> {
    if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
      throw new ForbiddenError("Only admins and managers can mark deals delivered");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.deal.findFirst({ where: { id: dealId, dealerId } });
    if (!existing) throw new NotFoundError("Deal not found");
    const updated = await db.deal.update({
      where: { id: dealId },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });
    let soldVehicleVin: string | undefined;
    if (existing.vehicleId) {
      const vehicle = await db.vehicle.update({
        where: { id: existing.vehicleId },
        data: { status: "SOLD" },
        select: { vin: true },
      });
      soldVehicleVin = vehicle.vin;
    }
    await logActivity(ctx, {
      action: "deal.delivered",
      entityType: "deal",
      entityId: dealId,
      before: { status: existing.status, deliveredAt: existing.deliveredAt },
      after: { status: "DELIVERED", deliveredAt: updated.deliveredAt },
      metadata: { deliveredBy: actor.id },
    });
    const deliveredAtIso = updated.deliveredAt
      ? updated.deliveredAt.toISOString()
      : new Date().toISOString();
    realtimeService.emitDealDelivered(dealerId, {
      dealId,
      vehicleId: updated.vehicleId,
      customerId: updated.customerId,
      deliveredAt: deliveredAtIso,
    });
    if (existing.vehicleId) {
      realtimeService.emitVehicleSold(dealerId, {
        vehicleId: existing.vehicleId,
        dealId,
        vin: soldVehicleVin ?? "",
      });
    }
    if (updated.assignedToId) {
      try {
        await notificationService.create({
          dealerId,
          userId: updated.assignedToId,
          type: "DEAL_DELIVERED",
          title: "Deal delivered",
          body: `Deal #${updated.id.slice(0, 6)} was delivered`,
          entityType: "DEAL",
          entityId: dealId,
          metadata: { vehicleId: updated.vehicleId, customerId: updated.customerId },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[deal.service] failed to emit deal:delivered notification", err);
      }
    }
    return updated;
  },

  /**
   * Cancel an in-progress deal. Records the unwind and frees the
   * vehicle back to AVAILABLE.
   */
  async cancel(
    ctx: AuditContext,
    dealerId: string,
    dealId: string,
    reason: string,
    actor: { id: string; role: string },
  ): Promise<Deal> {
    if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
      throw new ForbiddenError("Only admins and managers can cancel deals");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.deal.findFirst({ where: { id: dealId, dealerId } });
    if (!existing) throw new NotFoundError("Deal not found");
    const updated = await db.deal.update({
      where: { id: dealId },
      data: { status: "UNWOUND" },
    });
    if (existing.vehicleId) {
      await db.vehicle.update({
        where: { id: existing.vehicleId },
        data: { status: "AVAILABLE" },
      });
    }
    await logActivity(ctx, {
      action: "deal.cancelled",
      entityType: "deal",
      entityId: dealId,
      before: { status: existing.status },
      after: { status: "UNWOUND" },
      metadata: { reason, cancelledBy: actor.id },
    });
    return updated;
  },

  /**
   * Persist financial terms. Emits an implicit `deal.terms.updated`
   * log via the wrapper.
   */
  async updateTerms(
    ctx: AuditContext,
    dealerId: string,
    dealId: string,
    input: UpdateTermsInput,
  ): Promise<Deal> {
    const db = withAuditContext(ctx, defaultPrisma);
    const deal = await db.deal.findFirst({ where: { id: dealId, dealerId } });
    if (!deal) throw new NotFoundError("Deal not found");
    await db.dealTerms.upsert({
      where: { dealId },
      create: {
        dealId,
        salePrice: input.salePrice ?? null,
        tradeValue: input.tradeValue ?? null,
        tradePayoff: input.tradePayoff ?? null,
        downPayment: input.downPayment ?? null,
        taxAmount: input.taxAmount ?? null,
        feeTotal: input.feeTotal ?? null,
        financedAmount: input.financedAmount ?? null,
        rate: input.rate ?? null,
        termMonths: input.termMonths ?? null,
        paymentAmount: input.paymentAmount ?? null,
        lender: input.lender ?? null,
        frontGross: input.frontGross ?? null,
        backGross: input.backGross ?? null,
      },
      update: {
        ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
        ...(input.tradeValue !== undefined ? { tradeValue: input.tradeValue } : {}),
        ...(input.tradePayoff !== undefined ? { tradePayoff: input.tradePayoff } : {}),
        ...(input.downPayment !== undefined ? { downPayment: input.downPayment } : {}),
        ...(input.taxAmount !== undefined ? { taxAmount: input.taxAmount } : {}),
        ...(input.feeTotal !== undefined ? { feeTotal: input.feeTotal } : {}),
        ...(input.financedAmount !== undefined
          ? { financedAmount: input.financedAmount }
          : {}),
        ...(input.rate !== undefined ? { rate: input.rate } : {}),
        ...(input.termMonths !== undefined ? { termMonths: input.termMonths } : {}),
        ...(input.paymentAmount !== undefined
          ? { paymentAmount: input.paymentAmount }
          : {}),
        ...(input.lender !== undefined ? { lender: input.lender } : {}),
        ...(input.frontGross !== undefined ? { frontGross: input.frontGross } : {}),
        ...(input.backGross !== undefined ? { backGross: input.backGross } : {}),
      },
    });
    return db.deal.findUniqueOrThrow({ where: { id: dealId } });
  },

  async delete(
    ctx: AuditContext,
    dealerId: string,
    dealId: string,
    actor: { role: string },
  ): Promise<Deal> {
    if (actor.role !== "ADMIN") {
      throw new ForbiddenError("Only admins can delete deals");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.deal.findFirst({ where: { id: dealId, dealerId } });
    if (!existing) throw new NotFoundError("Deal not found");
    return db.deal.delete({ where: { id: dealId } });
  },
};
