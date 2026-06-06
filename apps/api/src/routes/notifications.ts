/**
 * Notification routes — /api/notifications/*
 *
 * All routes require authentication and tenant context. The user
 * scoping is done at the service layer (every query includes
 * `userId = request.user.userId`).
 *
 *   GET    /notifications              — paginated inbox
 *   GET    /notifications/unread-count — bell badge count
 *   POST   /notifications/:id/read     — mark single as read
 *   POST   /notifications/read-all     — mark all as read
 *   DELETE /notifications/:id          — delete one
 *
 * Response shape: `{ data, pagination? }` per the project
 * convention. Errors come from the global error handler.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";
import { validateQuery, validateParams } from "../utils/validate.js";
import {
  ListNotificationsQuerySchema,
  NotificationIdParamSchema,
} from "../schemas/notification.schema.js";
import { notificationService } from "../services/notification.service.js";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /notifications
   * Cursor-paginated inbox. Newest first.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListNotificationsQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const q = (request as { validatedQuery?: unknown }).validatedQuery as {
        cursor?: string;
        limit: number;
        unreadOnly?: boolean;
        type?:
          | "LEAD_ASSIGNED"
          | "LEAD_CREATED"
          | "LEAD_STATUS_CHANGED"
          | "CUSTOMER_CREATED"
          | "DEAL_STAGE_CHANGED"
          | "DEAL_DELIVERED"
          | "VEHICLE_SOLD"
          | "VEHICLE_PRICE_CHANGED"
          | "TEST_DRIVE_SCHEDULED"
          | "TEST_DRIVE_COMPLETED"
          | "APPOINTMENT_REMINDER"
          | "SYSTEM";
      };
      const result = await notificationService.list(
        payload.dealerId,
        payload.userId,
        {
          cursor: q.cursor,
          limit: q.limit,
          unreadOnly: Boolean(q.unreadOnly),
          type: q.type,
        },
      );
      return reply.status(200).send({
        data: result.items.map((row) => notificationService.toDTO(row)),
        pagination: {
          hasMore: result.nextCursor !== null,
          cursor: result.nextCursor,
        },
      });
    },
  );

  /**
   * GET /notifications/unread-count
   * Lightweight endpoint for the bell badge — single COUNT query.
   */
  app.get(
    "/unread-count",
    { preHandler: [app.authenticate], config: { requireTenant: true } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const count = await notificationService.unreadCount(
        payload.dealerId,
        payload.userId,
      );
      return reply.status(200).send({ data: { count } });
    },
  );

  /**
   * POST /notifications/:id/read
   * Mark a single notification as read. Verifies ownership first.
   */
  app.post(
    "/:id/read",
    {
      preHandler: [app.authenticate, validateParams(NotificationIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const params = request.params as { id: string };
      const updated = await notificationService.markRead(
        payload.dealerId,
        payload.userId,
        params.id,
      );
      return reply.status(200).send({ data: notificationService.toDTO(updated) });
    },
  );

  /**
   * POST /notifications/read-all
   * Mark every unread notification for the current user as read.
   */
  app.post(
    "/read-all",
    { preHandler: [app.authenticate], config: { requireTenant: true } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const result = await notificationService.markAllRead(
        payload.dealerId,
        payload.userId,
      );
      return reply.status(200).send({ data: result });
    },
  );

  /**
   * DELETE /notifications/:id
   * Permanently delete a notification. Verifies ownership.
   */
  app.delete(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(NotificationIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const params = request.params as { id: string };
      await notificationService.delete(payload.dealerId, payload.userId, params.id);
      return reply.status(204).send();
    },
  );
}
