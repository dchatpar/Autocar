/**
 * Calendar routes — /api/calendar/*
 *
 * Mounted under `/calendar` (parent app.ts owns the prefix).
 *
 * All routes require authentication.
 *
 * Multi-tenant: every Prisma call is scoped by `dealerId` from the JWT.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  CreateCalendarEventBodySchema,
  UpdateCalendarEventBodySchema,
  ListCalendarEventsQuerySchema,
  CalendarEventIdParamsSchema,
} from "../schemas/calendar.schema.js";
import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { calendarService } from "../services/calendar.service.js";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: string;
}

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /calendar/events
   * List events in a date range (month/week/day view).
   */
  app.get(
    "/events",
    {
      preHandler: [app.authenticate, validateQuery(ListCalendarEventsQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const q = (
        request as unknown as { validatedQuery: import("zod").infer<typeof ListCalendarEventsQuerySchema> }
      ).validatedQuery;

      const result = await calendarService.listEvents(payload.dealerId, {
        start: new Date(q.start),
        end: new Date(q.end),
        userId: q.userId,
        type: q.type ?? undefined,
        entityType: q.entityType,
        entityId: q.entityId,
        limit: q.limit,
        cursor: q.cursor,
      });

      return reply.send({ data: result.data, pagination: result.pagination });
    },
  );

  /**
   * GET /calendar/events/:id
   * Get a single calendar event.
   */
  app.get(
    "/events/:id",
    {
      preHandler: [app.authenticate, validateParams(CalendarEventIdParamsSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;

      const event = await calendarService.getById(payload.dealerId, id);
      return reply.send({ data: event });
    },
  );

  /**
   * POST /calendar/events
   * Create a calendar event.
   */
  app.post(
    "/events",
    {
      preHandler: [app.authenticate, validateBody(CreateCalendarEventBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as {
        title: string;
        description?: string;
        type?: string;
        start: string;
        end: string;
        allDay?: boolean;
        entityType?: string;
        entityId?: string;
        color?: string;
        location?: string;
        userId?: string;
        reminderAt?: string;
      };

      const event = await calendarService.create({
        dealerId: payload.dealerId,
        title: body.title,
        description: body.description,
        type: body.type as import("@prisma/client").CalendarEventType | undefined,
        start: new Date(body.start),
        end: new Date(body.end),
        allDay: body.allDay,
        entityType: body.entityType,
        entityId: body.entityId,
        color: body.color,
        location: body.location,
        userId: body.userId,
        reminderAt: body.reminderAt ? new Date(body.reminderAt) : undefined,
      });

      return reply.status(201).send({ data: event });
    },
  );

  /**
   * PUT /calendar/events/:id
   * Update a calendar event.
   */
  app.put(
    "/events/:id",
    {
      preHandler: [app.authenticate, validateParams(CalendarEventIdParamsSchema), validateBody(UpdateCalendarEventBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;
      const body = request.body as {
        title?: string;
        description?: string | null;
        type?: string;
        start?: string;
        end?: string;
        allDay?: boolean;
        entityType?: string | null;
        entityId?: string | null;
        color?: string | null;
        location?: string | null;
        userId?: string | null;
        reminderAt?: string | null;
      };

      const event = await calendarService.update(payload.dealerId, id, {
        title: body.title,
        description: body.description,
        type: body.type as import("@prisma/client").CalendarEventType | undefined,
        start: body.start ? new Date(body.start) : undefined,
        end: body.end ? new Date(body.end) : undefined,
        allDay: body.allDay,
        entityType: body.entityType ?? undefined,
        entityId: body.entityId ?? undefined,
        color: body.color,
        location: body.location,
        userId: body.userId,
        reminderAt: body.reminderAt ? new Date(body.reminderAt) : (body.reminderAt === null ? null : undefined),
      });

      return reply.send({ data: event });
    },
  );

  /**
   * DELETE /calendar/events/:id
   * Delete a calendar event.
   */
  app.delete(
    "/events/:id",
    {
      preHandler: [app.authenticate, validateParams(CalendarEventIdParamsSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;

      await calendarService.delete(payload.dealerId, id);
      return reply.status(204).send();
    },
  );
}

export default calendarRoutes;
