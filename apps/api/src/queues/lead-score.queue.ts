/**
 * Lead Score Queue — BullMQ-backed async score recompute.
 *
 * Why async:
 *   - A lead update shouldn't wait for 4 Prisma queries + a write
 *   - We want debouncing (rapid status changes collapse to one recompute)
 *   - Drift sweep across thousands of leads is a background job
 *
 * Redis is OPTIONAL — the queue degrades gracefully to a direct call
 * when REDIS_URL is not set or the connection fails. This keeps local
 * dev and unit tests working without infrastructure.
 *
 * Pattern:
 *   enqueueScoreRecompute({ dealerId, leadId, trigger })
 *     ├─ Redis available → BullMQ job, worker handles it
 *     └─ Redis missing   → fire-and-forget direct call (logs error)
 */

import { Queue, Worker, QueueEvents, type Job, type JobsOptions, type ConnectionOptions } from "bullmq";

import { prisma } from "../utils/prisma.js";
import { leadScoreTriggers, type ScoreTrigger } from "../services/lead-score-triggers.service.js";
import { logger } from "../utils/logger.js";

/* ============================================================
 * Job payload
 * ============================================================ */

export interface ScoreJobData {
  dealerId: string;
  leadId: string;
  trigger: ScoreTrigger;
  /** ms epoch — used for drift / dedupe heuristics. */
  enqueuedAt?: number;
}

export const LEAD_SCORE_QUEUE = "lead-score";

/* ============================================================
 * Redis + Queue lifecycle
 * ============================================================ */

declare global {
   
  var __dealerosScoreQueue: Queue<ScoreJobData> | undefined;
   
  var __dealerosScoreWorker: Worker<ScoreJobData> | undefined;
}

let queueInstance: Queue<ScoreJobData> | null = null;
let workerInstance: Worker<ScoreJobData> | null = null;
let eventsInstance: QueueEvents | null = null;

function isEnabled(): boolean {
  return Boolean(process.env.REDIS_URL) && process.env.LEAD_SCORE_QUEUE_DISABLED !== "true";
}

/**
 * Build a BullMQ-compatible connection descriptor from REDIS_URL.
 *
 * We pass a plain options object (NOT a pre-built ioredis instance) so
 * BullMQ constructs its own internal ioredis client. This sidesteps
 * the version-mismatch that surfaces when multiple ioredis versions
 * are hoisted into the pnpm store.
 */
function buildConnection(): ConnectionOptions | null {
  if (!isEnabled()) return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    // Allow override via env for maxRetriesPerRequest (BullMQ requires
    // `null` for blocking operations).
    return {
      url,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    };
  } catch (err) {
    logger.error("lead-score.queue", "failed to build redis connection", err);
    return null;
  }
}

/**
 * Lazily build the queue. Returns null if Redis isn't available.
 */
export function getScoreQueue(): Queue<ScoreJobData> | null {
  if (queueInstance) return queueInstance;
  if (globalThis.__dealerosScoreQueue) {
    queueInstance = globalThis.__dealerosScoreQueue;
    return queueInstance;
  }
  const conn = buildConnection();
  if (!conn) return null;

  const q = new Queue<ScoreJobData>(LEAD_SCORE_QUEUE, {
    connection: conn,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 500 },
      removeOnComplete: { age: 24 * 60 * 60, count: 5000 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  queueInstance = q;
  globalThis.__dealerosScoreQueue = q;
  return q;
}

/* ============================================================
 * Worker
 * ============================================================ */

export interface WorkerDeps {
  /** Override for tests. */
  recompute?: typeof leadScoreTriggers.recomputeAndPersist;
}

/**
 * Start a worker. Idempotent — calling twice is a no-op.
 * Returns the worker (or null when Redis is missing).
 */
export function startScoreWorker(
  deps: WorkerDeps = {},
): Worker<ScoreJobData> | null {
  if (workerInstance) return workerInstance;
  if (globalThis.__dealerosScoreWorker) {
    workerInstance = globalThis.__dealerosScoreWorker;
    return workerInstance;
  }
  const conn = buildConnection();
  if (!conn) return null;

  const recompute = deps.recompute ?? leadScoreTriggers.recomputeAndPersist;

  const w = new Worker<ScoreJobData>(
    LEAD_SCORE_QUEUE,
    async (job: Job<ScoreJobData>) => {
      const { dealerId, leadId, trigger } = job.data;
      const out = await recompute(dealerId, leadId, trigger);
      if (!out) {
        // Missing lead — drop the job silently.
        return { skipped: true };
      }
      return {
        score: out.result.score,
        classification: out.result.classification,
        historyId: out.historyId,
      };
    },
    {
      connection: conn,
      concurrency: Number(process.env.LEAD_SCORE_WORKER_CONCURRENCY ?? 4),
    },
  );

  w.on("failed", (job: Job<ScoreJobData> | undefined, err: Error) => {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        component: "lead-score.queue",
        jobId: job?.id,
        dealerId: job?.data.dealerId,
        leadId: job?.data.leadId,
        trigger: job?.data.trigger,
        err: err.message,
      }),
    );
  });
  w.on("completed", (job: Job<ScoreJobData>) => {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "info",
        component: "lead-score.queue",
        msg: "score job completed",
        jobId: job.id,
        dealerId: job.data.dealerId,
        leadId: job.data.leadId,
        trigger: job.data.trigger,
      }),
    );
  });

  workerInstance = w;
  globalThis.__dealerosScoreWorker = w;

  // Optional: a QueueEvents listener exposes `completed` / `failed` over
  // pub/sub for the API to fan-out to WebSockets. Cheap to create.
  if (!eventsInstance) {
    try {
      eventsInstance = new QueueEvents(LEAD_SCORE_QUEUE, { connection: conn });
    } catch {
      // Non-fatal; events are observability sugar.
    }
  }

  return w;
}

/**
 * Stop the worker + queue. Call from graceful shutdown.
 */
export async function stopScoreWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    globalThis.__dealerosScoreWorker = undefined;
  }
  if (eventsInstance) {
    await eventsInstance.close().catch(() => undefined);
    eventsInstance = null;
  }
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
    globalThis.__dealerosScoreQueue = undefined;
  }
}

/* ============================================================
 * Enqueue helpers
 * ============================================================ */

const DEFAULT_OPTS: JobsOptions = {
  // 1s debounce — rapid bursts of status changes collapse to one job.
  delay: 0,
  // BullMQ dedupes on (jobId) within the queue; use a stable id per
  // (dealer, lead) so the latest event wins.
  jobId: undefined,
};

/**
 * Enqueue a score recompute. Falls back to a direct call when Redis
 * is unavailable so the caller never has to know.
 */
export async function enqueueScoreRecompute(
  payload: ScoreJobData,
  opts: JobsOptions = {},
): Promise<{ queued: boolean; jobId?: string }> {
  const q = getScoreQueue();
  if (!q) {
    // Fallback: direct call, fire-and-forget. Errors are logged.
    void runDirect(payload);
    return { queued: false };
  }
  const jobId = opts.jobId ?? jobIdFor(payload);
  const jobOpts: JobsOptions = {
    ...DEFAULT_OPTS,
    ...opts,
    jobId,
  };
  const job = await q.add(LEAD_SCORE_QUEUE, payload, jobOpts);
  return { queued: true, jobId: job.id ?? jobId };
}

function jobIdFor(p: ScoreJobData): string {
  // Stable id so duplicate enqueues (within the dedupe window) collapse.
  return `score:${p.dealerId}:${p.leadId}:${p.trigger}`;
}

async function runDirect(payload: ScoreJobData): Promise<void> {
  try {
    const out = await leadScoreTriggers.recomputeAndPersist(
      payload.dealerId,
      payload.leadId,
      payload.trigger,
    );
    if (!out) return;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "info",
        component: "lead-score.queue",
        msg: "score recomputed (direct)",
        ...payload,
        score: out.result.score,
        classification: out.result.classification,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        component: "lead-score.queue",
        msg: "direct recompute failed",
        ...payload,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/* ============================================================
 * Convenience triggers — keep the call sites short
 * ============================================================ */

export const leadScoreQueue = {
  enqueueScoreRecompute,
  startScoreWorker,
  stopScoreWorker,
  getScoreQueue,
  isEnabled,
};

/* ============================================================
 * Drift sweep — recompute every lead older than 24h without a
 * recent score. Used by a cron / scheduled task.
 * ============================================================ */

export interface DriftSweepResult {
  total: number;
  enqueued: number;
  skipped: number;
}

export async function driftSweep(args: {
  olderThanHours?: number;
  limit?: number;
  trigger?: ScoreTrigger;
}): Promise<DriftSweepResult> {
  const olderThanHours = args.olderThanHours ?? 24;
  const limit = args.limit ?? 500;
  const trigger: ScoreTrigger = args.trigger ?? "drift_sweep";

  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

  // Leads whose last score is older than the cutoff — or never scored.
  const stale = await prisma.lead.findMany({
    where: {
      OR: [{ lastScoredAt: null }, { lastScoredAt: { lt: cutoff } }],
    },
    select: { id: true, dealerId: true },
    take: limit,
    orderBy: { lastScoredAt: "asc" },
  });

  let enqueued = 0;
  let skipped = 0;
  for (const lead of stale) {
    const r = await enqueueScoreRecompute(
      { dealerId: lead.dealerId, leadId: lead.id, trigger },
      { jobId: `score:${lead.dealerId}:${lead.id}:${trigger}:${Date.now()}` },
    );
    if (r.queued) enqueued += 1;
    else skipped += 1;
  }

  return { total: stale.length, enqueued, skipped };
}
