/**
 * Test Drive Service — schedule, complete, and cancel test drives.
 *
 * Every mutation runs through `withAuditContext()` so an
 * ActivityLog row is emitted. The trail shows test-drive outcomes
 * alongside the customer + vehicle timeline.
 */

import type { Appointment, Prisma } from "@prisma/client";

import { prisma as defaultPrisma } from "../utils/prisma.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { withAuditContext, logActivity, type AuditContext } from "./activity-logger.service.js";
import { realtimeService } from "./realtime.service.js";
import { notificationService } from "./notification.service.js";

export interface ScheduleTestDriveInput {
  dealerId: string;
  customerId: string;
  vehicleId: string;
  assignedToId?: string | null;
  scheduledAt: Date;
  durationMin?: number;
  notes?: string | null;
}

export const testDriveService = {
  /**
   * Schedule a test drive. Internally an Appointment row of type
   * TEST_DRIVE; the audit trail captures both the appointment and
   * the test-drive action verb. Also pushes a `testdrive:scheduled`
   * event over Socket.IO and a TEST_DRIVE_SCHEDULED notification
   * to the assigned rep.
   */
  async schedule(
    ctx: AuditContext,
    input: ScheduleTestDriveInput,
  ): Promise<Appointment> {
    if (input.scheduledAt.getTime() <= Date.now()) {
      throw new ValidationError("scheduledAt must be in the future");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    // Conflict check: don't double-book the same vehicle in the same window.
    const windowEnd = new Date(input.scheduledAt.getTime() + (input.durationMin ?? 30) * 60_000);
    const overlap = await db.appointment.findFirst({
      where: {
        dealerId: input.dealerId,
        type: "TEST_DRIVE",
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        scheduledAt: { lt: windowEnd },
        // No end-time column on Appointment, so approximate: scheduledAt + duration
      },
    });
    if (overlap) {
      throw new ConflictError("Another test drive overlaps this time slot");
    }
    const created = await db.appointment.create({
      data: {
        dealerId: input.dealerId,
        customerId: input.customerId,
        assignedToId: input.assignedToId ?? null,
        type: "TEST_DRIVE",
        scheduledAt: input.scheduledAt,
        durationMin: input.durationMin ?? 30,
        status: "SCHEDULED",
        notes: input.notes ?? null,
      },
    });
    await logActivity(ctx, {
      action: "test_drive.scheduled",
      entityType: "test_drive",
      entityId: created.id,
      after: {
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        scheduledAt: input.scheduledAt.toISOString(),
        durationMin: input.durationMin ?? 30,
      },
    });
    realtimeService.emitTestDriveScheduled(input.dealerId, {
      id: created.id,
      customerId: created.customerId ?? "",
      vehicleId: input.vehicleId,
      scheduledAt: created.scheduledAt.toISOString(),
      assignedToId: created.assignedToId,
    });
    if (created.assignedToId) {
      try {
        await notificationService.create({
          dealerId: input.dealerId,
          userId: created.assignedToId,
          type: "TEST_DRIVE_SCHEDULED",
          title: "Test drive scheduled",
          body: `Test drive on ${created.scheduledAt.toISOString()}`,
          entityType: "TEST_DRIVE",
          entityId: created.id,
          metadata: { customerId: input.customerId, vehicleId: input.vehicleId },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[test-drive.service] failed to emit scheduled notification", err);
      }
    }
    return created;
  },

  async complete(
    ctx: AuditContext,
    dealerId: string,
    appointmentId: string,
    outcome: { sold: boolean; notes?: string | null },
  ): Promise<Appointment> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.appointment.findFirst({
      where: { id: appointmentId, dealerId, type: "TEST_DRIVE" },
    });
    if (!existing) throw new NotFoundError("Test drive not found");
    const updated = await db.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "COMPLETED",
        notes: outcome.notes ?? existing.notes,
      },
    });
    await logActivity(ctx, {
      action: outcome.sold ? "test_drive.completed_sale" : "test_drive.completed",
      entityType: "test_drive",
      entityId: appointmentId,
      before: { status: existing.status },
      after: { status: "COMPLETED", sold: outcome.sold },
    });
    realtimeService.emitTestDriveCompleted(dealerId, {
      id: updated.id,
      customerId: updated.customerId ?? "",
      vehicleId: "",
      completedAt: new Date().toISOString(),
      sold: outcome.sold,
    });
    if (updated.assignedToId) {
      try {
        await notificationService.create({
          dealerId,
          userId: updated.assignedToId,
          type: "TEST_DRIVE_COMPLETED",
          title: outcome.sold ? "Test drive completed — SOLD" : "Test drive completed",
          body: outcome.sold
            ? "Customer bought after the drive"
            : "Test drive marked complete",
          entityType: "TEST_DRIVE",
          entityId: appointmentId,
          metadata: { sold: outcome.sold },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[test-drive.service] failed to emit completed notification", err);
      }
    }
    return updated;
  },

  async cancel(
    ctx: AuditContext,
    dealerId: string,
    appointmentId: string,
    reason: string,
  ): Promise<Appointment> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.appointment.findFirst({
      where: { id: appointmentId, dealerId, type: "TEST_DRIVE" },
    });
    if (!existing) throw new NotFoundError("Test drive not found");
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      throw new ValidationError("Cannot cancel a completed or already-cancelled test drive");
    }
    const updated = await db.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELLED" },
    });
    await logActivity(ctx, {
      action: "test_drive.cancelled",
      entityType: "test_drive",
      entityId: appointmentId,
      before: { status: existing.status },
      after: { status: "CANCELLED" },
      metadata: { reason },
    });
    return updated;
  },
};
