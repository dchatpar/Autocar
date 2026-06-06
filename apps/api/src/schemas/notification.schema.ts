/**
 * Zod schemas for the /notifications endpoints.
 *
 * Bodies, query, and params are validated through these schemas
 * (via the validateBody / validateQuery / validateParams helpers)
 * before reaching the service. Errors throw a ZodError which the
 * global error handler shapes into a 400 response.
 */

import { z } from "zod";

/* ============================================================
 * NotificationType — kept in sync with the Prisma enum
 * ============================================================ */

export const NotificationTypeSchema = z.enum([
  "LEAD_ASSIGNED",
  "LEAD_CREATED",
  "LEAD_STATUS_CHANGED",
  "CUSTOMER_CREATED",
  "DEAL_STAGE_CHANGED",
  "DEAL_DELIVERED",
  "VEHICLE_SOLD",
  "VEHICLE_PRICE_CHANGED",
  "TEST_DRIVE_SCHEDULED",
  "TEST_DRIVE_COMPLETED",
  "APPOINTMENT_REMINDER",
  "SYSTEM",
]);

/* ============================================================
 * List notifications
 * GET /notifications?cursor=&limit=&unreadOnly=&type=
 * ============================================================ */

export const ListNotificationsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  unreadOnly: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  type: NotificationTypeSchema.optional(),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;

/* ============================================================
 * Mark read
 * POST /notifications/:id/read
 * POST /notifications/read-all
 * ============================================================ */

export const NotificationIdParamSchema = z.object({
  id: z.string().min(1, "Notification id is required"),
});
export type NotificationIdParam = z.infer<typeof NotificationIdParamSchema>;
