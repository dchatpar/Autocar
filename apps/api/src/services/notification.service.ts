/**
 * Notification service — persistence + fan-out for the bell panel.
 *
 * Responsibilities:
 *   - Persist a `Notification` row scoped to a (dealerId, userId) pair.
 *   - Emit a live `notification` event over Socket.IO to that user
 *     (and the dealer's room, for activity feeds).
 *   - Mark single / all notifications as read.
 *   - Delete notifications.
 *   - Count unread for the bell badge.
 *
 * Multi-tenant: every read and write includes `dealerId` in the
 * where-clause. We never trust the caller to filter.
 *
 * The realtime emit happens AFTER the DB row is written, so a
 * client that subscribes after the create() never gets a phantom
 * event for a row that doesn't exist server-side.
 */

import type { Notification, Prisma } from "@prisma/client";

import { prisma as defaultPrisma } from "../utils/prisma.js";
import { realtimeService } from "./realtime.service.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

/* ============================================================
 * Public types
 * ============================================================ */

export interface CreateNotificationInput {
  dealerId: string;
  userId: string;
  type: Notification["type"];
  title: string;
  body: string;
  entityType?: Notification["entityType"];
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  /** Skip realtime emit (e.g. back-fill migrations). Defaults to false. */
  skipRealtime?: boolean;
}

export interface ListNotificationsQuery {
  cursor?: string;
  limit: number;
  unreadOnly?: boolean;
  type?: Notification["type"];
}

/* ============================================================
 * Helpers
 * ============================================================ */

function toDTO(row: Notification): Record<string, unknown> {
  return {
    id: row.id,
    dealerId: row.dealerId,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: row.metadata ?? {},
    isRead: row.isRead,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/* ============================================================
 * Service
 * ============================================================ */

export const notificationService = {
  /**
   * Create + emit. Idempotency: we don't currently de-dupe; if the
   * caller wants one-notif-per-(entity,user) it should check first
   * via findExisting().
   */
  async create(input: CreateNotificationInput): Promise<Notification> {
    if (!input.dealerId) {
      throw new ValidationError("dealerId is required");
    }
    if (!input.userId) {
      throw new ValidationError("userId is required");
    }
    if (!input.title || !input.body) {
      throw new ValidationError("title and body are required");
    }

    const row = await defaultPrisma.notification.create({
      data: {
        dealerId: input.dealerId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? {},
        isRead: false,
      },
    });

    if (!input.skipRealtime) {
      // Fan out: user's own room + dealer's room (so dashboards
      // can render an in-line "Marcus got a notification" item).
      realtimeService.emitNotification(input.userId, input.dealerId, toDTO(row));
    }

    return row;
  },

  /**
   * Look up a recent notification for the same (user, type, entityId)
   * triple — used to suppress dup notifications on rapid re-assign.
   */
  async findExisting(args: {
    dealerId: string;
    userId: string;
    type: Notification["type"];
    entityId: string | null;
    withinMinutes?: number;
  }): Promise<Notification | null> {
    const withinMs = (args.withinMinutes ?? 5) * 60 * 1000;
    const cutoff = new Date(Date.now() - withinMs);
    return defaultPrisma.notification.findFirst({
      where: {
        dealerId: args.dealerId,
        userId: args.userId,
        type: args.type,
        entityId: args.entityId,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Cursor-paginated list of the current user's notifications.
   * Newest first.
   */
  async list(
    dealerId: string,
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<{ items: Notification[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(query.limit, 1), 100);
    const rows = await defaultPrisma.notification.findMany({
      where: {
        dealerId,
        userId,
        ...(query.unreadOnly ? { isRead: false } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;
    return { items, nextCursor };
  },

  /**
   * Unread count for the bell badge. Cached query — index on
   * `(userId, isRead)` makes this a sub-millisecond lookup.
   */
  async unreadCount(dealerId: string, userId: string): Promise<number> {
    return defaultPrisma.notification.count({
      where: { dealerId, userId, isRead: false },
    });
  },

  /**
   * Mark a single notification as read. Verifies ownership
   * (dealerId + userId match) before writing.
   */
  async markRead(
    dealerId: string,
    userId: string,
    notificationId: string,
  ): Promise<Notification> {
    const existing = await defaultPrisma.notification.findFirst({
      where: { id: notificationId, dealerId, userId },
    });
    if (!existing) throw new NotFoundError("Notification not found");
    if (existing.isRead) return existing;
    return defaultPrisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  },

  /**
   * Mark every unread notification for the current user as read.
   * Returns the count updated so the client can refresh the badge.
   */
  async markAllRead(dealerId: string, userId: string): Promise<{ count: number }> {
    const result = await defaultPrisma.notification.updateMany({
      where: { dealerId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { count: result.count };
  },

  /**
   * Delete a single notification. Returns the deleted row so the
   * client can remove it from the local list.
   */
  async delete(
    dealerId: string,
    userId: string,
    notificationId: string,
  ): Promise<Notification> {
    const existing = await defaultPrisma.notification.findFirst({
      where: { id: notificationId, dealerId, userId },
    });
    if (!existing) throw new NotFoundError("Notification not found");
    await defaultPrisma.notification.delete({ where: { id: notificationId } });
    return existing;
  },

  /**
   * Internal helper used by the route layer to serialize a row
   * for the response. Pure.
   */
  toDTO,
};

export default notificationService;
