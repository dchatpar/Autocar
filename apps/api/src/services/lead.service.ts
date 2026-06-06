/**
 * Lead Service — business logic for lead mutations.
 *
 * Every mutation wraps the Prisma client in `withAuditContext()` so
 * an `ActivityLog` row is written in the same request. The
 * `before` snapshot, `after` snapshot, and computed `diff` are
 * persisted automatically by the wrapper.
 *
 * Multi-tenant: every read carries `dealerId`. Mutations extract
 * `dealerId` from the row itself.
 */

import type { Lead, LeadStatus, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../utils/prisma.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { withAuditContext, type AuditContext } from "./activity-logger.service.js";
import { realtimeService } from "./realtime.service.js";
import { notificationService } from "./notification.service.js";
import { logger } from "../utils/logger.js";

export interface CreateLeadInput {
  dealerId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  score?: number;
  status?: LeadStatus;
  assignedToId?: string | null;
  vehicleInterest?: Prisma.InputJsonValue;
  sourceMeta?: Prisma.InputJsonValue;
  customerId?: string | null;
}

export interface UpdateLeadInput {
  status?: LeadStatus;
  score?: number;
  assignedToId?: string | null;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  vehicleInterest?: Prisma.InputJsonValue;
  sourceMeta?: Prisma.InputJsonValue;
}

interface ActorLite {
  id: string;
  name?: string | null;
  role?: string;
}

function leadToCreatedPayload(lead: Lead): {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  currentScore: number;
  classification: string;
  assignedToId: string | null;
  createdAt: string;
} {
  return {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
    currentScore: lead.currentScore,
    classification: lead.classification,
    assignedToId: lead.assignedToId,
    createdAt: lead.createdAt.toISOString(),
  };
}

export const leadService = {
  /**
   * Create a new lead. Auto-audited via withAuditContext.
   * Emits `lead:created` to the dealer's room. When the lead is
   * assigned at create time, also emits `lead:assigned` to the
   * assignee and writes a LEARD_ASSIGNED notification.
   */
  async create(
    ctx: AuditContext,
    input: CreateLeadInput,
    actor?: ActorLite,
  ): Promise<Lead> {
    if (!input.firstName || !input.lastName) {
      throw new ValidationError("firstName and lastName are required");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const lead = await db.lead.create({
      data: {
        dealerId: input.dealerId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        source: input.source ?? null,
        score: input.score ?? 0,
        status: input.status ?? "NEW",
        assignedToId: input.assignedToId ?? null,
        vehicleInterest: input.vehicleInterest ?? [],
        sourceMeta: input.sourceMeta ?? {},
        customerId: input.customerId ?? null,
      },
    });
    realtimeService.emitLeadCreated(
      input.dealerId,
      leadToCreatedPayload(lead),
      actor ? { id: actor.id, name: actor.name ?? null } : undefined,
    );
    if (input.assignedToId) {
      realtimeService.emitLeadAssigned(input.dealerId, {
        leadId: lead.id,
        assignedToId: input.assignedToId,
        assignedById: actor?.id ?? "system",
      });
      try {
        await notificationService.create({
          dealerId: input.dealerId,
          userId: input.assignedToId,
          type: "LEAD_ASSIGNED",
          title: "New lead assigned to you",
          body: `${lead.firstName} ${lead.lastName}${lead.source ? ` from ${lead.source}` : ""}`,
          entityType: "LEAD",
          entityId: lead.id,
          metadata: { source: lead.source, currentScore: lead.currentScore },
        });
      } catch (err) {
        // Notifications are best-effort — never fail the create.
        logger.error("lead.service", "failed to emit lead:assigned notification", err);
      }
    }
    return lead;
  },

  /**
   * Update an existing lead. Auto-audited; the wrapper computes the
   * before/after diff and persists it. Emits `lead:updated` to the
   * dealer's room after the write commits.
   */
  async update(
    ctx: AuditContext,
    dealerId: string,
    leadId: string,
    input: UpdateLeadInput,
  ): Promise<Lead> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.lead.findFirst({
      where: { id: leadId, dealerId },
    });
    if (!existing) throw new NotFoundError("Lead not found");
    const updated = await db.lead.update({
      where: { id: leadId },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.score !== undefined ? { score: input.score } : {}),
        ...(input.assignedToId !== undefined
          ? { assignedToId: input.assignedToId }
          : {}),
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.vehicleInterest !== undefined
          ? { vehicleInterest: input.vehicleInterest }
          : {}),
        ...(input.sourceMeta !== undefined ? { sourceMeta: input.sourceMeta } : {}),
      },
    });
    realtimeService.emitLeadUpdated(dealerId, leadToCreatedPayload(updated));
    return updated;
  },

  /**
   * Assign a lead to a user. Emits a distinct `lead.assigned` event
   * (alongside the regular `lead.updated` row) so the timeline can
   * show assignment history at a glance. Also pushes a live
   * `lead:assigned` event over the WebSocket and a LEAD_ASSIGNED
   * notification to the assignee.
   */
  async assign(
    ctx: AuditContext,
    dealerId: string,
    leadId: string,
    assignedToId: string | null,
    assignedById: string,
  ): Promise<Lead> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.lead.findFirst({ where: { id: leadId, dealerId } });
    if (!existing) throw new NotFoundError("Lead not found");
    const updated = await db.lead.update({
      where: { id: leadId },
      data: { assignedToId },
    });
    // Emit a custom action in addition to the wrapper's `lead.updated`
    // log so the trail shows the assignment event.
    const { logActivity } = await import("./activity-logger.service.js");
    await logActivity(
      { ...ctx, metadata: { assignedBy: assignedById } },
      {
        action: "lead.assigned",
        entityType: "lead",
        entityId: leadId,
        before: { assignedToId: existing.assignedToId },
        after: { assignedToId: updated.assignedToId },
      },
    );
    if (assignedToId && assignedToId !== existing.assignedToId) {
      realtimeService.emitLeadAssigned(dealerId, {
        leadId,
        assignedToId,
        assignedById,
      });
      try {
        await notificationService.create({
          dealerId,
          userId: assignedToId,
          type: "LEAD_ASSIGNED",
          title: "New lead assigned to you",
          body: `${updated.firstName} ${updated.lastName}${updated.source ? ` from ${updated.source}` : ""}`,
          entityType: "LEAD",
          entityId: leadId,
          metadata: { source: updated.source, currentScore: updated.currentScore },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[lead.service] failed to emit lead:assigned notification", err);
      }
    }
    return updated;
  },

  /**
   * Move a lead through the pipeline. Emits `lead.status_changed`
   * alongside the wrapper's `lead.updated` row. Also pushes a live
   * `lead:status_changed` event to the dealer's room.
   */
  async changeStatus(
    ctx: AuditContext,
    dealerId: string,
    leadId: string,
    newStatus: LeadStatus,
  ): Promise<Lead> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.lead.findFirst({ where: { id: leadId, dealerId } });
    if (!existing) throw new NotFoundError("Lead not found");
    if (existing.status === newStatus) {
      return existing;
    }
    const updated = await db.lead.update({
      where: { id: leadId },
      data: { status: newStatus },
    });
    const { logActivity } = await import("./activity-logger.service.js");
    await logActivity(ctx, {
      action: "lead.status_changed",
      entityType: "lead",
      entityId: leadId,
      before: { status: existing.status },
      after: { status: updated.status },
    });
    realtimeService.emitLeadStatusChanged(dealerId, {
      leadId,
      from: existing.status,
      to: updated.status,
    });
    return updated;
  },

  /**
   * Update lead score. Emits a dedicated `lead.score_updated` event.
   */
  async updateScore(
    ctx: AuditContext,
    dealerId: string,
    leadId: string,
    score: number,
  ): Promise<Lead> {
    if (score < 0 || score > 100) {
      throw new ValidationError("Score must be between 0 and 100");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.lead.findFirst({ where: { id: leadId, dealerId } });
    if (!existing) throw new NotFoundError("Lead not found");
    const updated = await db.lead.update({
      where: { id: leadId },
      data: { score },
    });
    const { logActivity } = await import("./activity-logger.service.js");
    await logActivity(ctx, {
      action: "lead.score_updated",
      entityType: "lead",
      entityId: leadId,
      before: { score: existing.score },
      after: { score: updated.score },
    });
    return updated;
  },

  /**
   * Soft audit: record a lead routing decision without mutating the row.
   */
  async logRouted(
    ctx: AuditContext,
    leadId: string,
    payload: { assignedToId: string | null; strategy: string; reason: string },
  ): Promise<void> {
    const { logActivity } = await import("./activity-logger.service.js");
    await logActivity(ctx, {
      action: "lead.routed",
      entityType: "lead",
      entityId: leadId,
      after: payload,
    });
  },

  /**
   * Delete a lead. Auto-audited; the wrapper snapshots the row before
   * deletion. Requires ADMIN role.
   */
  async delete(
    ctx: AuditContext,
    dealerId: string,
    leadId: string,
    actor: { role: string },
  ): Promise<Lead> {
    if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
      throw new ForbiddenError("Only admins and managers can delete leads");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.lead.findFirst({ where: { id: leadId, dealerId } });
    if (!existing) throw new NotFoundError("Lead not found");
    return db.lead.delete({ where: { id: leadId } });
  },
};
