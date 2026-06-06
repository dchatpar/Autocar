/**
 * Plan limits — the canonical per-plan limits table.
 *
 * Single source of truth used by:
 *   - plan-limits.service.ts: enforce before creating a record
 *   - /api/billing/usage: render "x of y" meters on the dashboard
 *   - pricing page: feature matrix
 *
 * Limit semantics:
 *   - `null` means unlimited (Enterprise for some metrics, Pro for
 *     users).
 *   - Throw `PaymentRequiredError` (HTTP 402) when the dealer would
 *     exceed the cap. The error body includes the metric + the plan +
 *     the cap so the frontend can show "Upgrade to Pro for 10K leads".
 */

import type { SubscriptionPlan } from "@prisma/client";
import { PaymentRequiredError } from "../utils/errors.js";

/** All metered metrics the system tracks. */
export const METERED_METRICS = [
  "users",
  "leads",
  "sms_sent",
  "emails_sent",
  "ai_tokens",
] as const;
export type MeteredMetric = (typeof METERED_METRICS)[number];

interface PlanLimitRow {
  /** Display label. */
  label: string;
  /** Plan price (USD/month). */
  price: number;
  /** Cap on staff users (null = unlimited). */
  users: number | null;
  /** Leads ingestable per calendar month. */
  leads: number | null;
  /** SMS messages sendable per calendar month. */
  sms: number | null;
  /** Emails sendable per calendar month. */
  emails: number | null;
  /** AI tokens per calendar month. */
  aiTokens: number | null;
  /** Marketing copy shown on the pricing page. */
  tagline: string;
  /** Feature list shown on the pricing page. */
  features: ReadonlyArray<string>;
  /** True for the "Contact us" tier. */
  isCustom?: boolean;
}

const PLAN_LIMITS_TABLE: Record<SubscriptionPlan, PlanLimitRow> = {
  STARTER: {
    label: "Starter",
    price: 499,
    users: 3,
    leads: 200,
    sms: 200,
    emails: 500,
    aiTokens: 10_000,
    tagline: "For single-rooftop dealerships just getting organized.",
    features: [
      "Up to 3 staff users",
      "200 leads / month",
      "200 SMS / month",
      "500 emails / month",
      "10K AI tokens / month",
      "Inventory + CRM basics",
      "Email support",
    ],
  },
  GROWTH: {
    label: "Growth",
    price: 999,
    users: 10,
    leads: 1000,
    sms: 2000,
    emails: 5000,
    aiTokens: 100_000,
    tagline: "For growing stores running paid acquisition.",
    features: [
      "Up to 10 staff users",
      "1,000 leads / month",
      "2,000 SMS / month",
      "5,000 emails / month",
      "100K AI tokens / month",
      "AI lead scoring + routing",
      "Meta CAPI + Google Ads sync",
      "Priority email support",
    ],
  },
  PRO: {
    label: "Pro",
    price: 1499,
    users: null,
    leads: 10000,
    sms: 10000,
    emails: 50000,
    aiTokens: 1_000_000,
    tagline: "For multi-rooftop groups with high lead volume.",
    features: [
      "Unlimited staff users",
      "10,000 leads / month",
      "10,000 SMS / month",
      "50,000 emails / month",
      "1M AI tokens / month",
      "Multi-rooftop inventory",
      "Custom workflow automations",
      "Dedicated success manager",
    ],
  },
  ENTERPRISE: {
    label: "Enterprise",
    price: 2499,
    users: null,
    leads: null,
    sms: null,
    emails: null,
    aiTokens: null,
    tagline: "Custom volume, SLAs, and on-prem options.",
    features: [
      "Unlimited everything",
      "Custom usage tiers",
      "SSO + SAML + audit log retention",
      "On-prem / private cloud deployment",
      "White-glove migration",
      "99.95% uptime SLA",
    ],
    isCustom: true,
  },
};

/**
 * Return the full limits table — used by the pricing page.
 */
export function getPlanLimitsTable(): ReadonlyArray<PlanLimitRow> {
  return [
    PLAN_LIMITS_TABLE.STARTER,
    PLAN_LIMITS_TABLE.GROWTH,
    PLAN_LIMITS_TABLE.PRO,
    PLAN_LIMITS_TABLE.ENTERPRISE,
  ];
}

/**
 * Look up the limits row for a single plan.
 */
export function getPlanLimit(plan: SubscriptionPlan): PlanLimitRow {
  return PLAN_LIMITS_TABLE[plan];
}

/**
 * Resolve a plan from a dealer's data. Prefers the Subscription
 * table (canonical Stripe state) and falls back to Dealer.plan (set
 * during onboarding before Stripe is wired).
 */
export function resolveDealerPlan(input: {
  subscriptionPlan: SubscriptionPlan | null;
  dealerPlan: SubscriptionPlan;
}): SubscriptionPlan {
  return input.subscriptionPlan ?? input.dealerPlan;
}

interface EnforceInput {
  plan: SubscriptionPlan;
  metric: MeteredMetric;
  /** Current count of the metric for the period. */
  current: number;
  /** Number of units the caller is about to add. Defaults to 1. */
  delta?: number;
}

/**
 * Look up the cap for a given plan + metric. Returns `null` for
 * unlimited.
 */
export function capFor(plan: SubscriptionPlan, metric: MeteredMetric): number | null {
  const row = PLAN_LIMITS_TABLE[plan];
  switch (metric) {
    case "users":
      return row.users;
    case "leads":
      return row.leads;
    case "sms_sent":
      return row.sms;
    case "emails_sent":
      return row.emails;
    case "ai_tokens":
      return row.aiTokens;
  }
}

/**
 * Throw PaymentRequiredError (402) if the caller is about to exceed
 * the plan's cap. Returns silently when within limits or when the
 * cap is `null` (unlimited).
 *
 * Error body shape (response.details):
 *   {
 *     code: "PLAN_LIMIT_EXCEEDED",
 *     metric: "leads",
 *     current: 200,
 *     cap: 200,
 *     plan: "STARTER",
 *     upgradeTo: "GROWTH" | "PRO" | "ENTERPRISE"
 *   }
 */
export function enforcePlanLimit(input: EnforceInput): void {
  const cap = capFor(input.plan, input.metric);
  if (cap === null) return; // unlimited
  const delta = input.delta ?? 1;
  if (input.current + delta <= cap) return;

  // Recommend the cheapest tier that lifts the cap.
  const upgradeTo = recommendUpgrade(input.plan, input.metric);

  throw new PaymentRequiredError(
    `Plan limit exceeded: ${input.metric} (${input.current + delta}/${cap} on ${input.plan})`,
    {
      code: "PLAN_LIMIT_EXCEEDED",
      metric: input.metric,
      current: input.current,
      cap,
      plan: input.plan,
      delta,
      upgradeTo,
    },
  );
}

/**
 * Return the cheapest plan whose cap is strictly greater than the
 * dealer's current cap for the given metric. Returns null when no
 * plan in the table raises the cap (only happens for ENTERPRISE).
 */
export function recommendUpgrade(
  currentPlan: SubscriptionPlan,
  metric: MeteredMetric,
): SubscriptionPlan | null {
  const order: ReadonlyArray<SubscriptionPlan> = [
    "STARTER",
    "GROWTH",
    "PRO",
    "ENTERPRISE",
  ];
  const currentCap = capFor(currentPlan, metric);
  for (const p of order) {
    const c = capFor(p, metric);
    if (c === null) return p; // first unlimited tier wins
    if (currentCap !== null && c > currentCap) return p;
  }
  return null;
}
