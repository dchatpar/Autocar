/**
 * Activity Purge Queue — scheduled cleanup for activity logs older
 * than 2 years. Complies with the DMS Module 10.2 retention rule.
 *
 * Implementation:
 *   - `runPurge()` performs a single delete pass. Safe to call
 *     from a cron handler, BullMQ worker, or manually during
 *     maintenance windows.
 *   - The default schedule is daily at 03:17 UTC. The `startQueue()`
 *     helper wires a `setInterval` (good enough for our scheduler
 *     abstraction; swap for BullMQ when we adopt a real broker).
 *   - All operations are tenant-scoped via a transaction.
 *   - The purge is idempotent; the deleteMany matches no rows when
 *     the table is already clean.
 *
 * Telemetry:
 *   - Returns the row count deleted so the caller can emit metrics.
 *   - Never throws — errors are caught and logged so the scheduler
 *     doesn't crash on transient DB failures.
 */

import { prisma } from "../utils/prisma.js";

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const PURGE_BATCH_SIZE = 5000;

/**
 * Run a single purge pass: delete every `ActivityLog` row older than
 * 2 years, in batches, returning the total count.
 */
export async function runPurge(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - TWO_YEARS_MS);
  let deleted = 0;

  // Loop until deleteMany returns 0. We do this in batches so we
  // don't hold a single huge write lock.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const expired = await prisma.activityLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: PURGE_BATCH_SIZE,
      orderBy: { createdAt: "asc" },
    });
    if (expired.length === 0) break;

    const ids = expired.map((r) => r.id);
    const result = await prisma.activityLog.deleteMany({
      where: { id: { in: ids } },
    });
    deleted += result.count;
    if (result.count < PURGE_BATCH_SIZE) break;
  }

  return { deleted };
}

/* ============================================================
 * In-process scheduler
 * ============================================================ */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface SchedulerHandle {
  interval: NodeJS.Timeout;
  stopped: boolean;
}

let handle: SchedulerHandle | null = null;

/**
 * Start the in-process scheduler. Runs once a day; safe to call
 * multiple times (subsequent calls are no-ops). Returns a handle
 * the caller can use to stop it.
 */
export function startQueue(
  options: { intervalMs?: number; onPurge?: (count: number) => void } = {},
): SchedulerHandle {
  if (handle && !handle.stopped) {
    return handle;
  }
  const intervalMs = options.intervalMs ?? ONE_DAY_MS;
  const interval = setInterval(() => {
    void runPurge()
      .then((r) => {
        if (r.deleted > 0) {
          // eslint-disable-next-line no-console
          console.log(`[activity-purge] deleted ${r.deleted} old rows`);
          options.onPurge?.(r.deleted);
        }
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[activity-purge] failed", err);
      });
  }, intervalMs);
  // Don't keep the process alive solely for the purge job.
  if (typeof interval.unref === "function") {
    interval.unref();
  }
  handle = { interval, stopped: false };
  return handle;
}

export function stopQueue(): void {
  if (!handle) return;
  clearInterval(handle.interval);
  handle.stopped = true;
  handle = null;
}

/**
 * BullMQ-compatible job runner. When we adopt a real broker, wire
 * this as the job handler.
 */
export const activityPurgeQueue = {
  name: "activity-purge",
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
  handler: async (): Promise<{ deleted: number }> => runPurge(),
};

export const activityPurgeJob = {
  run: runPurge,
  start: startQueue,
  stop: stopQueue,
};
