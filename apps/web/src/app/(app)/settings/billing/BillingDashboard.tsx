"use client";

/**
 * BillingDashboard — interactive client island for /settings/billing.
 *
 * Surfaces:
 *   - Current plan card (with trial / cancel-at-period-end banners)
 *   - Plan comparison row (4 plans, current highlighted)
 *   - Usage meters (5 metrics)
 *   - Invoice history table
 *   - Manage-in-Stripe-Portal CTA
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlanCard } from "@/components/billing/PlanCard";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { InvoiceTable } from "@/components/billing/InvoiceTable";
import {
  useCancelSubscription,
  useCreatePortal,
  useInvoices,
  useResumeSubscription,
  useSubscription,
  useUpgradePlan,
  useUsage,
  statusLabel,
} from "@/hooks/useBilling";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CreditCard, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/api";

interface PlanRow {
  plan: SubscriptionPlan;
  label: string;
  price: number;
  tagline: string;
  features: ReadonlyArray<string>;
  isHighlighted?: boolean;
  isCustom?: boolean;
}

const PLANS: ReadonlyArray<PlanRow> = [
  {
    plan: "STARTER",
    label: "Starter",
    price: 499,
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
  {
    plan: "GROWTH",
    label: "Growth",
    price: 999,
    tagline: "For growing stores running paid acquisition.",
    isHighlighted: true,
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
  {
    plan: "PRO",
    label: "Pro",
    price: 1499,
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
  {
    plan: "ENTERPRISE",
    label: "Enterprise",
    price: 2499,
    tagline: "Custom volume, SLAs, and on-prem options.",
    isCustom: true,
    features: [
      "Unlimited everything",
      "Custom usage tiers",
      "SSO + SAML + audit log retention",
      "On-prem / private cloud deployment",
      "White-glove migration",
      "99.95% uptime SLA",
    ],
  },
];

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  STARTER: 1,
  GROWTH: 2,
  PRO: 3,
  ENTERPRISE: 4,
};

export function BillingDashboard() {
  const router = useRouter();
  const subQ = useSubscription();
  const usageQ = useUsage();
  const invoicesQ = useInvoices(24);

  const upgrade = useUpgradePlan();
  const cancel = useCancelSubscription();
  const resume = useResumeSubscription();
  const portal = useCreatePortal();

  const sub = subQ.data;
  const currentPlan: SubscriptionPlan = sub?.plan ?? "STARTER";
  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlan | null>(null);

  async function onSelect(plan: SubscriptionPlan): Promise<void> {
    if (plan === currentPlan) return;
    if (plan === "ENTERPRISE") {
      router.push("/contact-sales");
      return;
    }
    setPendingPlan(plan);
    try {
      await upgrade.mutateAsync({ plan });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Upgrade failed:", err);
    } finally {
      setPendingPlan(null);
    }
  }

  async function onCancel(): Promise<void> {
    if (!window.confirm("Cancel at the end of the current period?")) return;
    try {
      await cancel.mutateAsync();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Cancel failed:", err);
    }
  }

  async function onResume(): Promise<void> {
    try {
      await resume.mutateAsync();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Resume failed:", err);
    }
  }

  async function onPortal(): Promise<void> {
    try {
      const r = await portal.mutateAsync({});
      window.location.href = r.url;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Portal failed:", err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Current plan card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Current plan</CardTitle>
              <CardDescription>
                {subQ.isLoading
                  ? "Loading your subscription…"
                  : sub
                  ? `Status: ${statusLabel(sub.status)}`
                  : "No active subscription"}
              </CardDescription>
            </div>
            {sub?.status === "TRIALING" && sub.trialEnd && (
              <Badge variant="warning">
                Trial ends {new Date(sub.trialEnd).toLocaleDateString()}
              </Badge>
            )}
            {sub?.cancelAtPeriodEnd && (
              <Badge variant="danger">Cancels at period end</Badge>
            )}
            {sub?.status === "PAST_DUE" && (
              <Badge variant="danger">Past due</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {subQ.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !sub ? (
            <div className="flex flex-col items-start gap-3 p-4 rounded-lg border border-dashed border-border bg-bg-elevated">
              <p className="text-sm text-text-muted">
                You don't have an active subscription yet.
              </p>
              <Button
                onClick={() => router.push("/pricing")}
                variant="primary"
                size="md"
              >
                View pricing
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
                  Plan
                </p>
                <p className="text-lg font-semibold text-text-primary">
                  {sub.planLimits?.label ?? sub.plan}
                </p>
                <p className="text-sm text-text-muted">
                  {sub.planLimits
                    ? formatCurrency(sub.planLimits.price)
                    : "—"}
                  / month
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
                  Current period
                </p>
                <p className="text-sm text-text-primary tabular-nums">
                  {new Date(sub.currentPeriodStart).toLocaleDateString()} →{" "}
                  {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
                  Customer ID
                </p>
                <p className="text-xs font-mono text-text-muted truncate">
                  {sub.stripeCustomerId}
                </p>
              </div>
            </div>
          )}
        </CardContent>
        {sub && (
          <div className="px-6 pb-6 flex flex-wrap gap-2">
            <Button
              onClick={onPortal}
              variant="secondary"
              size="md"
              isLoading={portal.isPending}
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              <span>Manage in Stripe portal</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            {sub.cancelAtPeriodEnd ? (
              <Button
                onClick={onResume}
                variant="primary"
                size="md"
                isLoading={resume.isPending}
              >
                Resume subscription
              </Button>
            ) : sub.status !== "CANCELED" ? (
              <Button
                onClick={onCancel}
                variant="ghost"
                size="md"
                isLoading={cancel.isPending}
              >
                Cancel at period end
              </Button>
            ) : null}
          </div>
        )}
      </Card>

      {/* Usage meters */}
      <Card>
        <CardHeader>
          <CardTitle>Usage this month</CardTitle>
          <CardDescription>
            {usageQ.data
              ? `Reset on ${new Date(usageQ.data.periodEnd).toLocaleDateString()}`
              : "Aggregating your usage…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usageQ.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : usageQ.data ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {usageQ.data.metrics.map((m) => (
                <UsageMeter
                  key={m.metric}
                  metric={m.metric}
                  quantity={m.quantity}
                  cap={m.cap}
                  pct={m.pct}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No usage data yet.</p>
          )}

          {usageQ.data?.metrics.some(
            (m) => m.cap !== null && m.pct !== null && m.pct >= 0.9,
          ) && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-text-primary">
              <AlertCircle
                className="h-4 w-4 text-warning flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p>
                You're approaching a plan limit. Upgrade to keep your workflow
                moving.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan comparison */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Available plans
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((p) => {
            const isCurrent = p.plan === currentPlan;
            const isDowngrade = PLAN_RANK[p.plan] < PLAN_RANK[currentPlan];
            return (
              <PlanCard
                key={p.plan}
                plan={p.plan}
                label={p.label}
                price={p.price}
                tagline={p.tagline}
                features={p.features}
                isCurrent={isCurrent}
                isHighlighted={p.isHighlighted && !isCurrent}
                isCustom={p.isCustom}
                isDowngrade={isDowngrade}
                isLoading={pendingPlan === p.plan}
                disabled={isCurrent || (p.isCustom === true && pendingPlan !== null)}
                variant="compact"
                onSelect={(plan) => void onSelect(plan)}
              />
            );
          })}
        </div>
      </div>

      {/* Invoices */}
      <InvoiceTable
        invoices={invoicesQ.data ?? []}
        isLoading={invoicesQ.isLoading}
      />
    </div>
  );
}
