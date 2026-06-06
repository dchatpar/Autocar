/**
 * Usage meter — record + aggregate metered usage.
 *
 * Use cases:
 *   1. Track when a lead is created → usage-meter.record(dealerId, "leads")
 *   2. Track when an SMS is sent → usage-meter.record(dealerId, "sms_sent")
 *   3. Track AI tokens spent → usage-meter.record(dealerId, "ai_tokens", 1234)
 *   4. Render the billing dashboard meters → usage-meter.getCurrent(dealerId)
 *
 * The records are append-only; the dashboard meters aggregate by
 * summing `quantity` for the current calendar month.
 *
 * Multi-tenant: every read and write is scoped to a dealerId. There
 * is no cross-tenant query in this module.
 */

import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import {
  capFor,
  enforcePlanLimit,
  METERED_METRICS,
  type MeteredMetric,
} from "./plan-limits.service.js";
import type { SubscriptionPlan } from "@prisma/client";

/**
 * Returns the inclusive start / exclusive end of the current
 * calendar month in UTC. Using UTC keeps the dashboard meters stable
 * for multi-region dealers.
 */
export function currentMonthRange(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { start, end };
}

export interface UsageByMetric {
  metric: MeteredMetric;
  quantity: number;
  cap: number | null;
  /** Percentage of the cap consumed in [0, 1]. `null` when unlimited. */
  pct: number | null;
}

export interface CurrentUsage {
  dealerId: string;
  plan: SubscriptionPlan;
  periodStart: string; // ISO
  periodEnd: string; // ISO
  metrics: UsageByMetric[];
}

/**
 * Record a usage event. `delta` defaults to 1. Returns the created
 * record. Idempotency is the caller's responsibility — we don't
 * dedupe meter events.
 */
export async function record(
  dealerId: string,
  metric: MeteredMetric,
  delta: number = 1,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  if (!Number.isInteger(delta) || delta <= 0) {
    throw new Error(`usage-meter.record: delta must be a positive integer (got ${delta})`);
  }
  await prisma.usageRecord.create({
    data: {
      dealerId,
      metric,
      quantity: delta,
      metadata: metadata ?? PrismaNS.JsonNull,
    },
  });
}

/**
 * Check the dealer's plan limit for a given metric and throw
 * PaymentRequiredError (402) if a delta would exceed it. This is the
 * guard other services call before performing a metered action.
 *
 *   await usage-meter.guard({ dealerId, metric: "leads" });
 *   await leadService.create(...)
 *
 * Accepts an optional `delta` so callers can pre-check bulk actions
 * ("can I create 50 leads in this batch?").
 */
export async function guard(input: {
  dealerId: string;
  metric: MeteredMetric;
  plan: SubscriptionPlan;
  delta?: number;
}): Promise<void> {
  const { start, end } = currentMonthRange();
  const aggregate = await prisma.usageRecord.aggregate({
    where: {
      dealerId: input.dealerId,
      metric: input.metric,
      recordedAt: { gte: start, lt: end },
    },
    _sum: { quantity: true },
  });
  const current = aggregate._sum.quantity ?? 0;
  enforcePlanLimit({
    plan: input.plan,
    metric: input.metric,
    current,
    delta: input.delta,
  });
}

/**
 * Sum the dealer's usage for one metric over the current month.
 */
export async function totalForMetric(
  dealerId: string,
  metric: MeteredMetric,
): Promise<number> {
  const { start, end } = currentMonthRange();
  const r = await prisma.usageRecord.aggregate({
    where: {
      dealerId,
      metric,
      recordedAt: { gte: start, lt: end },
    },
    _sum: { quantity: true },
  });
  return r._sum.quantity ?? 0;
}

/**
 * User count is tracked separately (User rows with status ACTIVE) and
 * enforced via the User table, not UsageRecord. We expose a helper so
 * the dashboard meters can render a consistent shape.
 */
export async function activeUserCount(dealerId: string): Promise<number> {
  return prisma.user.count({
    where: { dealerId, status: "ACTIVE" },
  });
}

/**
 * Build the dashboard "usage" response. Aggregates all metered
 * metrics in one round-trip and includes the plan's cap + percent.
 *
 * For `users` we read from the User table (it's not a UsageRecord).
 * For everything else we sum the current month.
 */
export async function getCurrent(
  dealerId: string,
  plan: SubscriptionPlan,
): Promise<CurrentUsage> {
  const { start, end } = currentMonthRange();

  // One grouped query: sum quantity by metric for the current month.
  const grouped = await prisma.usageRecord.groupBy({
    by: ["metric"],
    where: {
      dealerId,
      recordedAt: { gte: start, lt: end },
    },
    _sum: { quantity: true },
  });

  const byMetric = new Map<string, number>();
  for (const row of grouped) {
    byMetric.set(row.metric, row._sum.quantity ?? 0);
  }

  const userCount = await activeUserCount(dealerId);

  const metrics: UsageByMetric[] = METERED_METRICS.map((m) => {
    const cap = capFor(plan, m);
    const quantity =
      m === "users" ? userCount : byMetric.get(m) ?? 0;
    const pct = cap === null ? null : Math.min(quantity / cap, 1);
    return { metric: m, quantity, cap, pct };
  });

  return {
    dealerId,
    plan,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    metrics,
  };
}

/**
 * Timeseries for a single metric over the last N days. Used by the
 * dashboard mini-charts (not currently rendered, but cheap to expose).
 */
export async function getTimeseries(
  dealerId: string,
  metric: MeteredMetric,
  days: number = 30,
): Promise<Array<{ date: string; quantity: number }>> {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const records = await prisma.usageRecord.findMany({
    where: {
      dealerId,
      metric,
      recordedAt: { gte: start, lt: end },
    },
    select: { quantity: true, recordedAt: true },
  });
  const byDay = new Map<string, number>();
  for (const r of records) {
    const d = r.recordedAt.toISOString().slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + r.quantity);
  }
  const out: Array<{ date: string; quantity: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, quantity: byDay.get(key) ?? 0 });
  }
  return out;
}

/**
 * Namespaced export — preferred by route handlers. Lets the route
 * import `usageMeter.record(...)` etc. without an extra destructure.
 */
export const usageMeter = {
  record,
  guard,
  totalForMetric,
  activeUserCount,
  getCurrent,
  getTimeseries,
  currentMonthRange,
};
