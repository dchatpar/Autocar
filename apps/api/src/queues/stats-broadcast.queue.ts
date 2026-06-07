/**
 * Stats Broadcast Queue — emits `stats:update` events to every
 * dealer's room on a 30-second cadence.
 *
 * What it computes (per dealer):
 *   - activeLeads, hotLeads, newLeadsToday
 *   - openDeals, dealsDelivered (last 30 days)
 *   - vehiclesAvailable, vehiclesSold (last 30 days)
 *   - testDrivesScheduled, testDrivesCompleted (last 30 days)
 *   - unreadNotifications
 *   - timestamp
 *
 * The dashboard's LiveKpiCards component subscribes to `stats:update`
 * and merges the values into the cached query state so the user
 * sees numbers move without a manual refresh.
 *
 * Lifecycle:
 *   - `statsBroadcastJob.start()` kicks off a setInterval that ticks
 *     every 30s. Idempotent — second call returns the existing
 *     handle. The interval is unref'd so it never holds the process
 *     alive on its own.
 *   - `statsBroadcastJob.stop()` clears it.
 *   - `STATS_BROADCAST_DISABLED=true` disables in tests.
 */

import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../utils/prisma.js";
import { realtimeService } from "../services/realtime.service.js";

const DEFAULT_INTERVAL_MS = 30_000;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface SchedulerHandle {
  interval: NodeJS.Timeout;
  stopped: boolean;
}

let handle: SchedulerHandle | null = null;

function isEnabled(): boolean {
  return process.env.STATS_BROADCAST_DISABLED !== "true";
}

function getIntervalMs(): number {
  const raw = process.env.STATS_BROADCAST_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1000) return DEFAULT_INTERVAL_MS;
  return parsed;
}

async function computeStatsForDealer(
  db: PrismaClient,
  dealerId: string,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const [
    activeLeads,
    hotLeads,
    newLeadsToday,
    openDeals,
    dealsDelivered,
    vehiclesAvailable,
    vehiclesSoldWindow,
    testDrivesScheduled,
    testDrivesCompleted,
    unreadNotifications,
    dealer,
  ] = await Promise.all([
    db.lead.count({ where: { dealerId, status: { in: ["NEW", "CONTACTED", "APPOINTMENT", "DEMO"] } } }),
    db.lead.count({ where: { dealerId, classification: "hot" } }),
    db.lead.count({ where: { dealerId, createdAt: { gte: dayStart } } }),
    db.deal.count({
      where: { dealerId, status: { in: ["WORKING", "PENDING_FINANCE", "APPROVED"] } },
    }),
    db.deal.count({
      where: { dealerId, status: "DELIVERED", deliveredAt: { gte: windowStart } },
    }),
    db.vehicle.count({ where: { dealerId, status: "AVAILABLE" } }),
    db.vehicle.count({
      where: { dealerId, status: "SOLD", updatedAt: { gte: windowStart } },
    }),
    db.appointment.count({
      where: {
        dealerId,
        type: "TEST_DRIVE",
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        scheduledAt: { gte: now },
      },
    }),
    db.appointment.count({
      where: {
        dealerId,
        type: "TEST_DRIVE",
        status: "COMPLETED",
        scheduledAt: { gte: windowStart },
      },
    }),
    db.notification.count({ where: { dealerId, isRead: false } }),
    db.dealer.findUnique({
      where: { id: dealerId },
      select: { id: true, name: true, subdomain: true, plan: true },
    }),
  ]);

  return {
    dealerId,
    dealer: dealer ?? null,
    windowDays: 30,
    activeLeads,
    hotLeads,
    newLeadsToday,
    openDeals,
    dealsDelivered,
    vehiclesAvailable,
    vehiclesSold: vehiclesSoldWindow,
    testDrivesScheduled,
    testDrivesCompleted,
    unreadNotifications,
    computedAt: now.toISOString(),
  };
}

async function tickAllDealers(db: PrismaClient): Promise<void> {
  const dealers = await db.dealer.findMany({ select: { id: true } });
  await Promise.all(
    dealers.map(async (row) => {
      const dealerId: string = row.id;
      try {
        const stats = await computeStatsForDealer(db, dealerId);
        realtimeService.emitStatsUpdate(dealerId, stats);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[stats-broadcast] failed to compute stats for dealer", {
          dealerId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}

/**
 * Compute + broadcast once on demand. Useful for tests and for
 * the /api/dashboard/stats endpoint to share the same shape.
 */
export async function broadcastStatsNow(
  db: PrismaClient = defaultPrisma,
): Promise<{ dealersBroadcast: number }> {
  const dealers = await db.dealer.findMany({ select: { id: true } });
  await Promise.all(
    dealers.map(async (row) => {
      const dealerId: string = row.id;
      const stats = await computeStatsForDealer(db, dealerId);
      realtimeService.emitStatsUpdate(dealerId, stats);
    }),
  );
  return { dealersBroadcast: dealers.length };
}

/**
 * Start the in-process scheduler. Idempotent.
 */
export function start(): SchedulerHandle {
  if (handle && !handle.stopped) return handle;
  if (!isEnabled()) {
    // eslint-disable-next-line no-console
    console.log("[stats-broadcast] disabled via STATS_BROADCAST_DISABLED=true");
    return { interval: setTimeout(() => undefined, 0) as unknown as NodeJS.Timeout, stopped: true };
  }
  const intervalMs = getIntervalMs();
  const interval = setInterval(() => {
    void tickAllDealers(defaultPrisma).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("[stats-broadcast] tick failed", err);
    });
  }, intervalMs);
  if (typeof interval.unref === "function") {
    interval.unref();
  }
  handle = { interval, stopped: false };

  // Fire one tick immediately so dashboards don't have to wait
  // the full interval on startup.
  void tickAllDealers(defaultPrisma).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[stats-broadcast] initial tick failed", err);
  });

  return handle;
}

export function stop(): void {
  if (!handle) return;
  clearInterval(handle.interval);
  handle.stopped = true;
  handle = null;
}

export const statsBroadcastJob = {
  start,
  stop,
  broadcastNow: broadcastStatsNow,
  computeStatsForDealer,
  isEnabled,
  getIntervalMs,
};

export default statsBroadcastJob;
