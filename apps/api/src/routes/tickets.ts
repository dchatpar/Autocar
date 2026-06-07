/**
 * Ticket routes — /api/tickets/*
 *
 * Mounted under `/tickets` (parent app.ts owns the prefix).
 *
 * All routes require authentication. RBAC:
 *   - GET  /tickets                — any authenticated user
 *   - GET  /tickets/:id           — any authenticated user
 *   - POST /tickets               — any authenticated user
 *   - POST /tickets/:id/responses — any authenticated user
 *   - PUT  /tickets/:id           — admin/manager only
 *   - PATCH /tickets/:id/status   — admin/manager only
 *
 * Multi-tenant: every Prisma call is scoped by `dealerId` from the JWT.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";

import {
  CreateTicketBodySchema,
  UpdateTicketBodySchema,
  PatchTicketStatusBodySchema,
  CreateTicketResponseBodySchema,
  ListTicketsQuerySchema,
  TicketIdParamsSchema,
} from "../schemas/ticket.schema.js";
import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { ticketService } from "../services/ticket.service.js";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

function isManager(role: UserRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export async function ticketRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /tickets
   * Create a new support ticket.
   */
  app.post(
    "/",
    {
      preHandler: [app.authenticate, validateBody(CreateTicketBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as {
        subject: string;
        body: string;
        priority?: string;
        category?: string;
        assignedToId?: string;
      };

      const ticket = await ticketService.create(
        { dealerId: payload.dealerId, userId: payload.userId, role: payload.role },
        {
          dealerId: payload.dealerId,
          createdById: payload.userId,
          subject: body.subject,
          body: body.body,
          priority: body.priority as import("@prisma/client").TicketIssuePriority | undefined,
          category: body.category,
          assignedToId: body.assignedToId,
        },
      );

      return reply.status(201).send({ data: ticket });
    },
  );

  /**
   * GET /tickets
   * List tickets with filters.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListTicketsQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const q = (
        request as unknown as { validatedQuery: import("zod").infer<typeof ListTicketsQuerySchema> }
      ).validatedQuery;

      const result = await ticketService.list(payload.dealerId, {
        status: q.status ?? undefined,
        priority: q.priority ?? undefined,
        assigneeId: q.assigneeId,
        category: q.category,
        limit: q.limit,
        cursor: q.cursor,
      });

      return reply.send({ data: result.data, pagination: result.pagination });
    },
  );

  /**
   * GET /tickets/:id
   * Get a ticket with its responses.
   */
  app.get(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(TicketIdParamsSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;

      const ticket = await ticketService.getById(payload.dealerId, id);
      return reply.send({ data: ticket });
    },
  );

  /**
   * POST /tickets/:id/responses
   * Add a response (note or reply) to a ticket.
   */
  app.post(
    "/:id/responses",
    {
      preHandler: [app.authenticate, validateParams(TicketIdParamsSchema), validateBody(CreateTicketResponseBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;
      const body = request.body as { body: string; isInternal?: boolean };

      const ticket = await ticketService.addResponse(
        { dealerId: payload.dealerId, userId: payload.userId, role: payload.role },
        payload.dealerId,
        {
          ticketId: id,
          authorId: payload.userId,
          body: body.body,
          isInternal: body.isInternal,
        },
      );

      return reply.status(201).send({ data: ticket });
    },
  );

  /**
   * PUT /tickets/:id
   * Update a ticket (admin/manager only).
   */
  app.put(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(TicketIdParamsSchema), validateBody(UpdateTicketBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;

      if (!isManager(payload.role)) {
        return reply.status(403).send({ error: { message: "Forbidden" } });
      }

      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;
      const body = request.body as {
        subject?: string;
        body?: string;
        priority?: string;
        category?: string | null;
        assignedToId?: string | null;
      };

      const ticket = await ticketService.update(
        { dealerId: payload.dealerId, userId: payload.userId, role: payload.role },
        payload.dealerId,
        id,
        {
          subject: body.subject,
          body: body.body,
          priority: body.priority as import("@prisma/client").TicketIssuePriority | undefined,
          category: body.category,
          assignedToId: body.assignedToId,
        },
      );

      return reply.send({ data: ticket });
    },
  );

  /**
   * PATCH /tickets/:id/status
   * Update the status of a ticket (admin/manager only).
   */
  app.patch(
    "/:id/status",
    {
      preHandler: [app.authenticate, validateParams(TicketIdParamsSchema), validateBody(PatchTicketStatusBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;

      if (!isManager(payload.role)) {
        return reply.status(403).send({ error: { message: "Forbidden" } });
      }

      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;
      const body = request.body as { status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" };

      const ticket = await ticketService.patchStatus(
        { dealerId: payload.dealerId, userId: payload.userId, role: payload.role },
        payload.dealerId,
        id,
        body.status as import("@prisma/client").TicketStatus,
      );

      return reply.send({ data: ticket });
    },
  );
}

// Alias for backward compatibility with existing app.ts imports
export const ticketsRoutes = ticketRoutes;
export default ticketRoutes;
