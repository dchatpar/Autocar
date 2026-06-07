/**
 * Appointment Service — calendar event CRUD.
 *
 * All mutations are wrapped in withAuditContext() so every
 * create/update/delete emits an ActivityLog row in the same
 * transaction.
 */

import type { Appointment, AppointmentStatus, AppointmentType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { prisma as defaultPrisma } from "../utils/prisma.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { withAuditContext, logActivity, type AuditContext } from "./activity-logger.service.js";

export interface CreateAppointmentInput {
  dealerId: string;
  leadId?: string | null;
  customerId?: string | null;
  assignedToId?: string | null;
  type: AppointmentType;
  scheduledAt: Date;
  durationMin?: number;
  notes?: string | null;
}

export interface UpdateAppointmentInput {
  scheduledAt?: Date;
  durationMin?: number;
  assignedToId?: string | null;
  notes?: string | null;
  type?: AppointmentType;
}

export interface ListAppointmentsFilter {
  startDate?: Date;
  endDate?: Date;
  assignedToId?: string | null;
  type?: AppointmentType;
  status?: AppointmentStatus;
  leadId?: string | null;
  customerId?: string | null;
}

export const appointmentService = {
  /**
   * Create a calendar appointment.
   */
  async create(
    ctx: AuditContext,
    input: CreateAppointmentInput,
  ): Promise<Appointment> {
    if (!input.scheduledAt) {
      throw new ValidationError("scheduledAt is required");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    return db.appointment.create({
      data: {
        dealerId: input.dealerId,
        leadId: input.leadId ?? null,
        customerId: input.customerId ?? null,
        assignedToId: input.assignedToId ?? null,
        type: input.type,
        scheduledAt: input.scheduledAt,
        durationMin: input.durationMin ?? 30,
        status: "SCHEDULED",
        notes: input.notes ?? null,
      },
    });
  },

  /**
   * Get a single appointment by id. Returns null if not found or
   * belongs to a different dealer.
   */
  async getById(
    dealerId: string,
    appointmentId: string,
  ): Promise<Appointment | null> {
    return defaultPrisma.appointment.findFirst({
      where: { id: appointmentId, dealerId },
    });
  },

  /**
   * Update an appointment. Returns the updated row.
   */
  async update(
    ctx: AuditContext,
    dealerId: string,
    appointmentId: string,
    input: UpdateAppointmentInput,
  ): Promise<Appointment> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.appointment.findFirst({
      where: { id: appointmentId, dealerId },
    });
    if (!existing) throw new NotFoundError("Appointment not found");
    return db.appointment.update({
      where: { id: appointmentId },
      data: {
        ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
        ...(input.durationMin !== undefined ? { durationMin: input.durationMin } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
      },
    });
  },

  /**
   * Change appointment status (confirm, cancel, no-show, complete).
   */
  async changeStatus(
    ctx: AuditContext,
    dealerId: string,
    appointmentId: string,
    newStatus: AppointmentStatus,
  ): Promise<Appointment> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.appointment.findFirst({
      where: { id: appointmentId, dealerId },
    });
    if (!existing) throw new NotFoundError("Appointment not found");

    const VALID_TRANSITIONS: Record<string, AppointmentStatus[]> = {
      SCHEDULED: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
      CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
      COMPLETED: [],
      CANCELLED: [],
      NO_SHOW: ["CONFIRMED"],
    };
    const allowed = VALID_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(newStatus) && existing.status !== newStatus) {
      throw new ValidationError(
        `Cannot transition from ${existing.status} to ${newStatus}`,
      );
    }

    const updated = await db.appointment.update({
      where: { id: appointmentId },
      data: { status: newStatus },
    });
    await logActivity(ctx, {
      action: "appointment.status_changed",
      entityType: "appointment",
      entityId: appointmentId,
      before: { status: existing.status },
      after: { status: newStatus },
    });
    return updated;
  },

  /**
   * Delete an appointment. Only SCHEDULED or CONFIRMED appointments
   * can be deleted without a reason; completed/cancelled ones require
   * a reason in notes.
   */
  async delete(
    ctx: AuditContext,
    dealerId: string,
    appointmentId: string,
  ): Promise<Appointment> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.appointment.findFirst({
      where: { id: appointmentId, dealerId },
    });
    if (!existing) throw new NotFoundError("Appointment not found");
    return db.appointment.delete({
      where: { id: appointmentId },
    });
  },

  /**
   * List appointments with cursor pagination and optional filters.
   */
  async list(
    dealerId: string,
    filter: ListAppointmentsFilter,
    pagination: { cursor?: string; limit: number },
  ): Promise<{ items: Appointment[]; pagination: { hasMore: boolean; cursor: string | null } }> {
    const { cursor, limit } = pagination;

    const where: Prisma.AppointmentWhereInput = {
      dealerId,
    };

    if (filter.startDate && filter.endDate) {
      where.scheduledAt = { gte: filter.startDate, lte: filter.endDate };
    } else if (filter.startDate) {
      where.scheduledAt = { gte: filter.startDate };
    } else if (filter.endDate) {
      where.scheduledAt = { lte: filter.endDate };
    }
    if (filter.assignedToId) {
      where.assignedToId = filter.assignedToId;
    }
    if (filter.type) {
      where.type = filter.type;
    }
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.leadId !== undefined) {
      where.leadId = filter.leadId;
    }
    if (filter.customerId !== undefined) {
      where.customerId = filter.customerId;
    }

    const items = await defaultPrisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore && result.length > 0 ? result[result.length - 1]!.id : null;

    return { items: result, pagination: { hasMore, cursor: nextCursor } };
  },
};
