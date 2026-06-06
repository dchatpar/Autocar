/**
 * Ticket Service — business logic for support ticket mutations.
 *
 * Multi-tenant: every Prisma call carries `dealerId`. Tickets are scoped
 * to the authenticated dealer's tenant. Responses include the author
 * relationship for display.
 */

import type { Prisma, Ticket, TicketIssuePriority, TicketStatus } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { NotFoundError } from "../utils/errors.js";
import { withAuditContext, logActivity, type AuditContext } from "./activity-logger.service.js";

export interface CreateTicketInput {
  dealerId: string;
  createdById: string;
  subject: string;
  body: string;
  priority?: TicketIssuePriority;
  category?: string | null;
  assignedToId?: string | null;
}

export interface UpdateTicketInput {
  subject?: string;
  body?: string;
  priority?: TicketIssuePriority;
  category?: string | null;
  assignedToId?: string | null;
}

export interface CreateTicketResponseInput {
  ticketId: string;
  authorId: string;
  body: string;
  isInternal?: boolean;
}

export interface ListTicketFilters {
  status?: TicketStatus | null;
  priority?: TicketIssuePriority | null;
  assigneeId?: string | null;
  category?: string | null;
  limit: number;
  cursor?: string | null;
}

export const ticketService = {
  /**
   * Create a new ticket.
   */
  async create(ctx: AuditContext, input: CreateTicketInput): Promise<Ticket> {
    const ticket = await withAuditContext(ctx, prisma).ticket.create({
      data: {
        dealerId: input.dealerId,
        createdById: input.createdById,
        subject: input.subject,
        body: input.body,
        priority: input.priority ?? "MEDIUM",
        category: input.category ?? null,
        assignedToId: input.assignedToId ?? null,
        status: "OPEN",
      },
    });

    await logActivity(ctx, {
      action: "ticket.created",
      entityType: "ticket",
      entityId: ticket.id,
      after: { id: ticket.id, subject: ticket.subject },
    });

    return ticket;
  },

  /**
   * List tickets for a dealer with filters and cursor pagination.
   */
  async list(
    dealerId: string,
    filters: ListTicketFilters,
  ): Promise<{ data: Ticket[]; pagination: { hasMore: boolean; cursor: string | null } }> {
    const where: Prisma.TicketWhereInput = { dealerId };

    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assigneeId) where.assignedToId = filters.assigneeId;
    if (filters.category) where.category = filters.category;

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit + 1,
      ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
    });

    const hasMore = tickets.length > filters.limit;
    if (hasMore) tickets.pop();
    const cursor = hasMore && tickets.length > 0 ? (tickets[tickets.length - 1]?.id ?? null) : null;

    return { data: tickets, pagination: { hasMore, cursor } };
  },

  /**
   * Get a single ticket with its responses. Throws NotFoundError if not found.
   */
  async getById(dealerId: string, ticketId: string): Promise<Ticket & { responses: Array<{ id: string; body: string; isInternal: boolean; createdAt: Date; author: { id: string; name: string } }> }> {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, dealerId },
      include: {
        responses: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundError("Ticket not found");
    return ticket as Ticket & { responses: Array<{ id: string; body: string; isInternal: boolean; createdAt: Date; author: { id: string; name: string } }> };
  },

  /**
   * Update a ticket.
   */
  async update(
    ctx: AuditContext,
    dealerId: string,
    ticketId: string,
    input: UpdateTicketInput,
  ): Promise<Ticket> {
    const existing = await this.getById(dealerId, ticketId);

    const updateData: Prisma.TicketUpdateInput = {};
    if (input.subject !== undefined) updateData.subject = input.subject;
    if (input.body !== undefined) updateData.body = input.body;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.category !== undefined) updateData.category = input.category;
    if (input.assignedToId !== undefined) updateData.assignedTo = input.assignedToId ? { connect: { id: input.assignedToId } } : { disconnect: true };

    const updated = await withAuditContext(ctx, prisma).ticket.update({
      where: { id: ticketId },
      data: updateData,
    });

    await logActivity(ctx, {
      action: "ticket.updated",
      entityType: "ticket",
      entityId: ticketId,
      before: { subject: existing.subject },
      after: { subject: updated.subject },
    });

    return updated;
  },

  /**
   * Patch the status of a ticket.
   */
  async patchStatus(
    ctx: AuditContext,
    dealerId: string,
    ticketId: string,
    status: TicketStatus,
  ): Promise<Ticket> {
    const updateData: Prisma.TicketUpdateInput = { status };
    if (status === "RESOLVED" || status === "CLOSED") updateData.resolvedAt = new Date();

    const result = await withAuditContext(ctx, prisma).ticket.updateMany({
      where: { id: ticketId, dealerId },
      data: updateData,
    });
    if (result.count === 0) throw new NotFoundError("Ticket not found");

    await logActivity(ctx, {
      action: "ticket.status_changed",
      entityType: "ticket",
      entityId: ticketId,
      after: { status },
    });

    const updated = await this.getById(dealerId, ticketId);
    return updated as Ticket;
  },

  /**
   * Add a response to a ticket.
   */
  async addResponse(
    ctx: AuditContext,
    dealerId: string,
    input: CreateTicketResponseInput,
  ): Promise<Ticket> {
    // Verify ticket belongs to dealer
    const ticket = await prisma.ticket.findFirst({
      where: { id: input.ticketId, dealerId },
    });
    if (!ticket) throw new NotFoundError("Ticket not found");

    await prisma.ticketResponse.create({
      data: {
        ticketId: input.ticketId,
        authorId: input.authorId,
        body: input.body,
        isInternal: input.isInternal ?? false,
      },
    });

    // Auto-transition to IN_PROGRESS if currently OPEN
    if (ticket.status === "OPEN") {
      await prisma.ticket.update({
        where: { id: input.ticketId },
        data: { status: "IN_PROGRESS" },
      });
    }

    await logActivity(ctx, {
      action: "ticket.response_added",
      entityType: "ticket",
      entityId: input.ticketId,
      after: { authorId: input.authorId, isInternal: input.isInternal ?? false },
    });

    const updated = await this.getById(dealerId, input.ticketId);
    return updated as Ticket;
  },
};

export default ticketService;
