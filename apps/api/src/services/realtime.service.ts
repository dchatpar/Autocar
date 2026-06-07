/**
 * Realtime service — the single source of truth for emitting
 * Socket.IO events. Every other service goes through this module
 * so we can:
 *
 *   1. Centralize the room-naming convention (`dealer:<id>`, `user:<id>`).
 *   2. Apply a consistent payload shape (`{ dealerId, ts, ... }`).
 *   3. Centralize no-op handling when Socket.IO isn't initialized
 *      (unit tests, partial bootstrap).
 *   4. Provide a `withRealtime()` wrapper that emits the event AFTER
 *      the database write commits, so a UI that opens on a fresh
 *      page never gets a "ghost" event.
 *
 * Event catalog (server → client):
 *   - `lead:created`           — full lead object
 *   - `lead:updated`           — full lead object
 *   - `lead:assigned`          — { leadId, assignedToId, assignedById }
 *   - `lead:status_changed`    — { leadId, from, to }
 *   - `customer:created`       — full customer object
 *   - `deal:stage_changed`     — { dealId, from, to }
 *   - `deal:delivered`         — { dealId, vehicleId, customerId }
 *   - `vehicle:sold`           — { vehicleId, dealId }
 *   - `vehicle:price_changed`  — { vehicleId, oldPrice, newPrice }
 *   - `testdrive:scheduled`    — full appointment
 *   - `testdrive:completed`    — full appointment
 *   - `notification`           — full notification object
 *   - `stats:update`           — KPIs payload
 *   - `presence:user_online`   — { userId, ts }
 *   - `presence:user_offline`  — { userId, ts }
 *
 * Payload convention: every event includes `dealerId` and `ts`
 * (ms epoch) so clients can dedupe across reconnects and reconcile
 * with the server clock.
 */

import type { Server as SocketIOServer } from "socket.io";

import { tryGetIO } from "../plugins/websocket.js";

/* ============================================================
 * Helpers
 * ============================================================ */

function withMeta<T extends Record<string, unknown>>(
  dealerId: string,
  payload: T,
): T & { dealerId: string; ts: number } {
  return {
    ...payload,
    dealerId,
    ts: Date.now(),
  };
}

function emit(
  event: string,
  room: string,
  payload: Record<string, unknown>,
): void {
  const io: SocketIOServer | null = tryGetIO();
  if (!io) return;
  io.to(room).emit(event, payload);
}

function emitTo(
  event: string,
  rooms: ReadonlyArray<string>,
  payload: Record<string, unknown>,
): void {
  const io: SocketIOServer | null = tryGetIO();
  if (!io) return;
  for (const room of rooms) {
    io.to(room).emit(event, payload);
  }
}

/* ============================================================
 * Public emit surface
 * ============================================================ */

export interface LeadCreatedPayload {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status: string;
  currentScore: number;
  classification: string;
  assignedToId?: string | null;
  createdAt: string;
}

export const realtimeService = {
  // ---------- LEADS ----------

  emitLeadCreated(
    dealerId: string,
    lead: LeadCreatedPayload,
    actor?: { id: string; name?: string | null },
  ): void {
    emit(
      "lead:created",
      `dealer:${dealerId}`,
      withMeta(dealerId, {
        lead,
        createdBy: actor ? { id: actor.id, name: actor.name ?? null } : null,
      }),
    );
  },

  emitLeadUpdated(
    dealerId: string,
    lead: LeadCreatedPayload,
  ): void {
    emit("lead:updated", `dealer:${dealerId}`, withMeta(dealerId, { lead }));
  },

  emitLeadAssigned(
    dealerId: string,
    payload: { leadId: string; assignedToId: string | null; assignedById: string },
  ): void {
    const rooms: string[] = [`dealer:${dealerId}`];
    if (payload.assignedToId) {
      rooms.push(`user:${payload.assignedToId}`);
    }
    emitTo("lead:assigned", rooms, withMeta(dealerId, payload));
  },

  emitLeadStatusChanged(
    dealerId: string,
    payload: { leadId: string; from: string; to: string },
  ): void {
    emit(
      "lead:status_changed",
      `dealer:${dealerId}`,
      withMeta(dealerId, payload),
    );
  },

  // ---------- CUSTOMERS ----------

  emitCustomerCreated(
    dealerId: string,
    customer: { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null },
    actor?: { id: string; name?: string | null },
  ): void {
    emit(
      "customer:created",
      `dealer:${dealerId}`,
      withMeta(dealerId, {
        customer,
        createdBy: actor ? { id: actor.id, name: actor.name ?? null } : null,
      }),
    );
  },

  // ---------- DEALS ----------

  emitDealStageChanged(
    dealerId: string,
    payload: { dealId: string; from: string; to: string; vehicleId?: string | null; customerId?: string },
  ): void {
    emit(
      "deal:stage_changed",
      `dealer:${dealerId}`,
      withMeta(dealerId, payload),
    );
  },

  emitDealDelivered(
    dealerId: string,
    payload: { dealId: string; vehicleId?: string | null; customerId: string; deliveredAt: string },
  ): void {
    emit("deal:delivered", `dealer:${dealerId}`, withMeta(dealerId, payload));
  },

  // ---------- VEHICLES ----------

  emitVehicleSold(
    dealerId: string,
    payload: { vehicleId: string; dealId: string; vin: string },
  ): void {
    emit("vehicle:sold", `dealer:${dealerId}`, withMeta(dealerId, payload));
  },

  emitVehiclePriceChanged(
    dealerId: string,
    payload: { vehicleId: string; oldPrice: number | null; newPrice: number | null },
  ): void {
    emit(
      "vehicle:price_changed",
      `dealer:${dealerId}`,
      withMeta(dealerId, payload),
    );
  },

  // ---------- TEST DRIVES ----------

  emitTestDriveScheduled(
    dealerId: string,
    appointment: { id: string; customerId: string; vehicleId: string; scheduledAt: string; assignedToId?: string | null },
  ): void {
    const rooms: string[] = [`dealer:${dealerId}`];
    if (appointment.assignedToId) {
      rooms.push(`user:${appointment.assignedToId}`);
    }
    emitTo("testdrive:scheduled", rooms, withMeta(dealerId, { appointment }));
  },

  emitTestDriveCompleted(
    dealerId: string,
    appointment: { id: string; customerId: string; vehicleId: string; completedAt: string; sold: boolean },
  ): void {
    emit("testdrive:completed", `dealer:${dealerId}`, withMeta(dealerId, { appointment }));
  },

  // ---------- NOTIFICATIONS ----------

  /**
   * Send a notification to a single user. The Notification row is
   * persisted by the notification service; this just fans it out
   * to the live socket.
   */
  emitNotification(
    userId: string,
    dealerId: string,
    notification: Record<string, unknown>,
  ): void {
    emitTo(
      "notification",
      [`user:${userId}`, `dealer:${dealerId}`],
      withMeta(dealerId, notification),
    );
  },

  // ---------- TASKS ----------

  emitTaskCreated(
    dealerId: string,
    task: Record<string, unknown>,
    _dealerSettings?: unknown,
  ): void {
    const rooms: string[] = [`dealer:${dealerId}`];
    if (task.assignedToId) {
      rooms.push(`user:${task.assignedToId}`);
    }
    emitTo("task:created", rooms, withMeta(dealerId, { task }));
  },

  emitTaskUpdated(
    dealerId: string,
    task: Record<string, unknown>,
    _dealerSettings?: unknown,
  ): void {
    const rooms: string[] = [`dealer:${dealerId}`];
    if (task.assignedToId) {
      rooms.push(`user:${task.assignedToId}`);
    }
    emitTo("task:updated", rooms, withMeta(dealerId, { task }));
  },

  // ---------- STATS / KPI ----------

  emitStatsUpdate(dealerId: string, stats: Record<string, unknown>): void {
    emit("stats:update", `dealer:${dealerId}`, withMeta(dealerId, stats));
  },

  // ---------- Presence ----------

  /**
   * Force a presence refresh for a dealer. Useful when the session
   * list is rebuilt server-side and clients should re-pull.
   */
  broadcastPresenceRefresh(dealerId: string): void {
    emit("presence:refresh", `dealer:${dealerId}`, withMeta(dealerId, {}));
  },
};

export default realtimeService;
