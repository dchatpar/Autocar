/**
 * Campaign Queue — BullMQ-backed async work for the Marketing
 * Campaigns module.
 *
 * Three queues live on the same BullMQ connection:
 *   1. `campaign-trigger`  — domain events stream here (lead.created,
 *                            status_changed, …). The trigger service
 *                            consumes them and matches against active
 *                            campaigns, fanning out into enrollments.
 *   2. `campaign-step`     — per-enrollment step jobs. Each step of
 *                            every active enrollment is its own job
 *                            so we can requeue / cancel / retry
 *                            independently. A `delay` (ms) aligns with
 *                            the step's `nextRunAt` (so WAIT steps
 *                            become delayed jobs).
 *   3. `campaign-sweep`    — periodic maintenance: re-emit the
 *                            `lead.no_activity` and `customer.birthday`
 *                            events once a day. Idempotent.
 *
 * Why async:
 *   - A `lead.created` webhook shouldn't block on a campaign match.
 *   - 10 000 enrolled leads × N steps means O(100k) jobs in flight
 *     during a backfill; a queue is the only sane runtime.
 *
 * Redis is OPTIONAL — the queue degrades gracefully to a direct
 * call when REDIS_URL is not set or the connection fails. This keeps
 * local dev and unit tests working without infrastructure.
 *
 * Pattern (mirrors `lead-score.queue.ts`):
 *   enqueueTrigger(event)            → falls back to direct call
 *   enqueueStep({ enrollmentId })    → falls back to direct call
 *   enqueueSweep()                   → falls back to no-op
 */

import {
  Queue,
  Worker,
  QueueEvents,
  type Job,
  type JobsOptions,
  type ConnectionOptions,
} from "bullmq";
import { prisma } from "../utils/prisma.js";
import { campaignTriggers, type CampaignTriggerEvent } from "../services/campaign-trigger.service.js";
import { campaignStepProcessor } from "../services/campaign-step-processor.service.js";

/* ============================================================
 * Job payloads
 * ============================================================ */

export const CAMPAIGN_TRIGGER_QUEUE = "campaign-trigger";
export const CAMPAIGN_STEP_QUEUE = "campaign-step";
export const CAMPAIGN_SWEEP_QUEUE = "campaign-sweep";

export interface TriggerJobData {
  event: CampaignTriggerEvent;
  enqueuedAt?: number;
}

export interface StepJobData {
  dealerId: string;
  enrollmentId: string;
  stepId: string;
  /** ms epoch — used to log drift between planned and actual run time. */
  scheduledFor?: number;
  /** True when re-enqueued after a retry. */
  isRetry?: boolean;
}

export interface SweepJobData {
  /** "no_activity" | "birthday" — the sweep kind. */
  kind: "no_activity" | "birthday";
  enqueuedAt?: number;
}

/* ============================================================
 * Redis + queue lifecycle
 * ============================================================ */

declare global {
  // eslint-disable-next-line no-var
  var __dealerosCampaignTriggerQueue: Queue<TriggerJobData> | undefined;
  // eslint-disable-next-line no-var
  var __dealerosCampaignStepQueue: Queue<StepJobData> | undefined;
  // eslint-disable-next-line no-var
  var __dealerosCampaignSweepQueue: Queue<SweepJobData> | undefined;
  // eslint-disable-next-line no-var
  var __dealerosCampaignTriggerWorker: Worker<TriggerJobData> | undefined;
  // eslint-disable-next-line no-var
  var __dealerosCampaignStepWorker: Worker<StepJobData> | undefined;
  // eslint-disable-next-line no-var
  var __dealerosCampaignSweepWorker: Worker<SweepJobData> | undefined;
}

let triggerQueueInstance: Queue<TriggerJobData> | null = null;
let stepQueueInstance: Queue<StepJobData> | null = null;
let sweepQueueInstance: Queue<SweepJobData> | null = null;
let triggerWorkerInstance: Worker<TriggerJobData> | null = null;
let stepWorkerInstance: Worker<StepJobData> | null = null;
let sweepWorkerInstance: Worker<SweepJobData> | null = null;
let triggerEventsInstance: QueueEvents | null = null;
let stepEventsInstance: QueueEvents | null = null;

function isEnabled(): boolean {
  return Boolean(process.env.REDIS_URL) && process.env.CAMPAIGN_QUEUE_DISABLED !== "true";
}

function buildConnection(): ConnectionOptions | null {
  if (!isEnabled()) return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return {
    url,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}

function defaultJobOptions(): JobsOptions {
  return {
    attempts: Number(process.env.CAMPAIGN_JOB_ATTEMPTS ?? 3),
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 5000,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
    },
  };
}

/* ============================================================
 * Queue constructors
 * ============================================================ */

export function getTriggerQueue(): Queue<TriggerJobData> | null {
  if (triggerQueueInstance) return triggerQueueInstance;
  if (globalThis.__dealerosCampaignTriggerQueue) {
    triggerQueueInstance = globalThis.__dealerosCampaignTriggerQueue;
    return triggerQueueInstance;
  }
  const conn = buildConnection();
  if (!conn) return null;
  const q = new Queue<TriggerJobData>(CAMPAIGN_TRIGGER_QUEUE, {
    connection: conn,
    defaultJobOptions: defaultJobOptions(),
  });
  triggerQueueInstance = q;
  globalThis.__dealerosCampaignTriggerQueue = q;
  return q;
}

export function getStepQueue(): Queue<StepJobData> | null {
  if (stepQueueInstance) return stepQueueInstance;
  if (globalThis.__dealerosCampaignStepQueue) {
    stepQueueInstance = globalThis.__dealerosCampaignStepQueue;
    return stepQueueInstance;
  }
  const conn = buildConnection();
  if (!conn) return null;
  const q = new Queue<StepJobData>(CAMPAIGN_STEP_QUEUE, {
    connection: conn,
    defaultJobOptions: {
      ...defaultJobOptions(),
      // Step jobs can be delayed by hours (WAIT steps). BullMQ supports
      // arbitrary `delay` so we don't need a custom store.
      attempts: Number(process.env.CAMPAIGN_STEP_ATTEMPTS ?? 5),
      backoff: { type: "exponential", delay: 30_000 },
    },
  });
  stepQueueInstance = q;
  globalThis.__dealerosCampaignStepQueue = q;
  return q;
}

export function getSweepQueue(): Queue<SweepJobData> | null {
  if (sweepQueueInstance) return sweepQueueInstance;
  if (globalThis.__dealerosCampaignSweepQueue) {
    sweepQueueInstance = globalThis.__dealerosCampaignSweepQueue;
    return sweepQueueInstance;
  }
  const conn = buildConnection();
  if (!conn) return null;
  const q = new Queue<SweepJobData>(CAMPAIGN_SWEEP_QUEUE, {
    connection: conn,
    defaultJobOptions: {
      ...defaultJobOptions(),
      // Sweep jobs run once a day; BullMQ's `repeat` is wired below.
      removeOnComplete: { age: 24 * 60 * 60, count: 100 },
    },
  });
  sweepQueueInstance = q;
  globalThis.__dealerosCampaignSweepQueue = q;
  return q;
}

/* ============================================================
 * Workers
 * ============================================================ */

export interface WorkerDeps {
  /** Override for tests. */
  matchTriggers?: typeof campaignTriggers.matchAndEnroll;
  /** Override for tests. */
  processStep?: typeof campaignStepProcessor.processOne;
  /** Override for tests. */
  runSweep?: (kind: "no_activity" | "birthday") => Promise<{ emitted: number }>;
}

async function runSweepImpl(
  kind: "no_activity" | "birthday",
): Promise<{ emitted: number }> {
  // Load all active dealers and emit the appropriate event.
  const dealers = await prisma.dealer.findMany({
    select: { id: true },
  });
  let emitted = 0;
  const today = new Date();
  for (const d of dealers) {
    if (kind === "no_activity") {
      // Sweep every lead not contacted in 14+ days. The trigger
      // service applies the campaign-level "days" filter on top.
      const stale = await prisma.lead.findMany({
        where: {
          dealerId: d.id,
          OR: [
            { lastContactedAt: null, createdAt: { lt: new Date(today.getTime() - 14 * 86_400_000) } },
            { lastContactedAt: { lt: new Date(today.getTime() - 14 * 86_400_000) } },
          ],
        },
        select: { id: true },
        take: 500,
      });
      for (const lead of stale) {
        await campaignTriggers.handleEvent({
          event: "lead.no_activity",
          dealerId: d.id,
          leadId: lead.id,
          payload: { days: 14 },
          occurredAt: Date.now(),
        });
        emitted += 1;
      }
    } else {
      // Birthday sweep — emit for every customer whose DOB falls
      // in the next 7 days.
      const upcoming = await prisma.customer.findMany({
        where: {
          dealerId: d.id,
          deletedAt: null,
          dob: { not: null },
        },
        select: { id: true, dob: true },
        take: 2000,
      });
      for (const c of upcoming) {
        if (!c.dob) continue;
        const daysUntil = daysUntilBirthday(c.dob, today);
        if (daysUntil >= 0 && daysUntil <= 7) {
          await campaignTriggers.handleEvent({
            event: "customer.birthday",
            dealerId: d.id,
            customerId: c.id,
            payload: { daysBefore: daysUntil },
            occurredAt: Date.now(),
          });
          emitted += 1;
        }
      }
    }
  }
  return { emitted };
}

function daysUntilBirthday(dob: Date, now: Date): number {
  const month = dob.getUTCMonth();
  const day = dob.getUTCDate();
  const year = now.getUTCFullYear();
  // Build a Date for the next birthday in the current year.
  const candidate = new Date(Date.UTC(year, month, day));
  if (candidate.getTime() < now.getTime() - 86_400_000) {
    candidate.setUTCFullYear(year + 1);
  }
  return Math.floor((candidate.getTime() - now.getTime()) / 86_400_000);
}

export function startTriggerWorker(
  deps: WorkerDeps = {},
): Worker<TriggerJobData> | null {
  if (triggerWorkerInstance) return triggerWorkerInstance;
  if (globalThis.__dealerosCampaignTriggerWorker) {
    triggerWorkerInstance = globalThis.__dealerosCampaignTriggerWorker;
    return triggerWorkerInstance;
  }
  const conn = buildConnection();
  if (!conn) return null;

  const matchTriggers = deps.matchTriggers ?? campaignTriggers.matchAndEnroll;

  const w = new Worker<TriggerJobData>(
    CAMPAIGN_TRIGGER_QUEUE,
    async (job: Job<TriggerJobData>) => {
      const result = await matchTriggers(job.data.event);
      return { enrolled: result.enrolled, matched: result.matched };
    },
    {
      connection: conn,
      concurrency: Number(process.env.CAMPAIGN_TRIGGER_WORKER_CONCURRENCY ?? 4),
    },
  );

  wireWorkerLogging(w, "campaign-trigger.queue");
  triggerWorkerInstance = w;
  globalThis.__dealerosCampaignTriggerWorker = w;

  if (!triggerEventsInstance) {
    try {
      triggerEventsInstance = new QueueEvents(CAMPAIGN_TRIGGER_QUEUE, {
        connection: conn,
      });
    } catch {
      /* observability sugar — non-fatal */
    }
  }
  return w;
}

export function startStepWorker(
  deps: WorkerDeps = {},
): Worker<StepJobData> | null {
  if (stepWorkerInstance) return stepWorkerInstance;
  if (globalThis.__dealerosCampaignStepWorker) {
    stepWorkerInstance = globalThis.__dealerosCampaignStepWorker;
    return stepWorkerInstance;
  }
  const conn = buildConnection();
  if (!conn) return null;

  const processStep = deps.processStep ?? campaignStepProcessor.processOne;

  const w = new Worker<StepJobData>(
    CAMPAIGN_STEP_QUEUE,
    async (job: Job<StepJobData>) => {
      const out = await processStep(
        job.data.dealerId,
        job.data.enrollmentId,
        job.data.stepId,
      );
      return out;
    },
    {
      connection: conn,
      concurrency: Number(process.env.CAMPAIGN_STEP_WORKER_CONCURRENCY ?? 8),
    },
  );

  wireWorkerLogging(w, "campaign-step.queue");
  stepWorkerInstance = w;
  globalThis.__dealerosCampaignStepWorker = w;

  if (!stepEventsInstance) {
    try {
      stepEventsInstance = new QueueEvents(CAMPAIGN_STEP_QUEUE, {
        connection: conn,
      });
    } catch {
      /* non-fatal */
    }
  }
  return w;
}

export function startSweepWorker(
  deps: WorkerDeps = {},
): Worker<SweepJobData> | null {
  if (sweepWorkerInstance) return sweepWorkerInstance;
  if (globalThis.__dealerosCampaignSweepWorker) {
    sweepWorkerInstance = globalThis.__dealerosCampaignSweepWorker;
    return sweepWorkerInstance;
  }
  const conn = buildConnection();
  if (!conn) return null;

  const runSweep = deps.runSweep ?? runSweepImpl;

  const w = new Worker<SweepJobData>(
    CAMPAIGN_SWEEP_QUEUE,
    async (job: Job<SweepJobData>) => {
      const r = await runSweep(job.data.kind);
      return r;
    },
    {
      connection: conn,
      concurrency: 1,
    },
  );

  wireWorkerLogging(w, "campaign-sweep.queue");
  sweepWorkerInstance = w;
  globalThis.__dealerosCampaignSweepWorker = w;

  // Schedule the repeat jobs. BullMQ's `add` with `repeat` is the
  // canonical way to schedule cron-like jobs.
  const q = getSweepQueue();
  if (q) {
    void q.add(
      "no_activity",
      { kind: "no_activity", enqueuedAt: Date.now() },
      {
        repeat: { pattern: "0 9 * * *" }, // 9am UTC every day
        jobId: "sweep:no_activity:daily",
      },
    );
    void q.add(
      "birthday",
      { kind: "birthday", enqueuedAt: Date.now() },
      {
        repeat: { pattern: "0 8 * * *" }, // 8am UTC every day
        jobId: "sweep:birthday:daily",
      },
    );
  }

  return w;
}

function wireWorkerLogging<TData>(
  w: Worker<TData>,
  component: string,
): void {
  w.on("failed", (job: Job<TData> | undefined, err: Error) => {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        component,
        jobId: job?.id,
        err: err.message,
      }),
    );
  });
  w.on("completed", (job: Job<TData>) => {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "info",
        component,
        msg: "job completed",
        jobId: job.id,
      }),
    );
  });
}

/**
 * Stop all workers + queues. Called from graceful shutdown.
 */
export async function stopCampaignWorkers(): Promise<void> {
  await Promise.allSettled([
    closeWorker(triggerWorkerInstance, () => {
      triggerWorkerInstance = null;
      globalThis.__dealerosCampaignTriggerWorker = undefined;
    }),
    closeWorker(stepWorkerInstance, () => {
      stepWorkerInstance = null;
      globalThis.__dealerosCampaignStepWorker = undefined;
    }),
    closeWorker(sweepWorkerInstance, () => {
      sweepWorkerInstance = null;
      globalThis.__dealerosCampaignSweepWorker = undefined;
    }),
    closeEvents(triggerEventsInstance, () => {
      triggerEventsInstance = null;
    }),
    closeEvents(stepEventsInstance, () => {
      stepEventsInstance = null;
    }),
    closeQueue(triggerQueueInstance, () => {
      triggerQueueInstance = null;
      globalThis.__dealerosCampaignTriggerQueue = undefined;
    }),
    closeQueue(stepQueueInstance, () => {
      stepQueueInstance = null;
      globalThis.__dealerosCampaignStepQueue = undefined;
    }),
    closeQueue(sweepQueueInstance, () => {
      sweepQueueInstance = null;
      globalThis.__dealerosCampaignSweepQueue = undefined;
    }),
  ]);
}

async function closeWorker<T>(
  w: Worker<T> | null,
  reset: () => void,
): Promise<void> {
  if (!w) return;
  try {
    await w.close();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[campaign.queue] worker close failed", err);
  } finally {
    reset();
  }
}

async function closeEvents(
  e: QueueEvents | null,
  reset: () => void,
): Promise<void> {
  if (!e) return;
  try {
    await e.close();
  } catch {
    /* non-fatal */
  } finally {
    reset();
  }
}

async function closeQueue<T>(
  q: Queue<T> | null,
  reset: () => void,
): Promise<void> {
  if (!q) return;
  try {
    await q.close();
  } catch {
    /* non-fatal */
  } finally {
    reset();
  }
}

/* ============================================================
 * Enqueue helpers — fall back to direct call when Redis is missing
 * ============================================================ */

export async function enqueueTrigger(
  event: CampaignTriggerEvent,
  opts: JobsOptions = {},
): Promise<{ queued: boolean; jobId?: string }> {
  const q = getTriggerQueue();
  if (!q) {
    void runTriggerDirect(event);
    return { queued: false };
  }
  const jobId =
    opts.jobId ?? `trigger:${event.dealerId}:${event.event}:${Date.now()}`;
  const job = await q.add(
    CAMPAIGN_TRIGGER_QUEUE,
    { event, enqueuedAt: Date.now() },
    { ...opts, jobId },
  );
  return { queued: true, jobId: job.id ?? jobId };
}

export async function enqueueStep(
  payload: StepJobData,
  opts: JobsOptions = {},
): Promise<{ queued: boolean; jobId?: string }> {
  const q = getStepQueue();
  if (!q) {
    void runStepDirect(payload);
    return { queued: false };
  }
  const jobId =
    opts.jobId ??
    `step:${payload.dealerId}:${payload.enrollmentId}:${payload.stepId}:${Date.now()}`;
  const job = await q.add(CAMPAIGN_STEP_QUEUE, payload, {
    ...opts,
    jobId,
  });
  return { queued: true, jobId: job.id ?? jobId };
}

async function runTriggerDirect(event: CampaignTriggerEvent): Promise<void> {
  try {
    await campaignTriggers.matchAndEnroll(event);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        component: "campaign-trigger.queue",
        msg: "direct trigger match failed",
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function runStepDirect(payload: StepJobData): Promise<void> {
  try {
    await campaignStepProcessor.processOne(
      payload.dealerId,
      payload.enrollmentId,
      payload.stepId,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        component: "campaign-step.queue",
        msg: "direct step process failed",
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/* ============================================================
 * Convenience triggers — keep the call sites short
 * ============================================================ */

export const campaignQueue = {
  enqueueTrigger,
  enqueueStep,
  startTriggerWorker,
  startStepWorker,
  startSweepWorker,
  stopCampaignWorkers,
  getTriggerQueue,
  getStepQueue,
  getSweepQueue,
  isEnabled,
};
