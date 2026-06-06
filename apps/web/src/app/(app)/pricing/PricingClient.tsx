"use client";

/**
 * Client island for the public pricing page.
 *
 * Renders the four plan tiles (using PlanCard) and the top
 * "hero" section. The CTA calls /api/billing/create-checkout-session
 * and redirects to the hosted Stripe Checkout URL.
 *
 * No authentication is required to view this page; the checkout
 * endpoint will reject the request if the user isn't signed in and
 * redirect them through Stripe's hosted UI.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlanCard } from "@/components/billing/PlanCard";
import { useCreateCheckout } from "@/hooks/useBilling";
import type { SubscriptionPlan } from "@/types/api";

const PLANS: ReadonlyArray<{
  plan: SubscriptionPlan;
  label: string;
  price: number;
  tagline: string;
  features: ReadonlyArray<string>;
  isHighlighted?: boolean;
  isCustom?: boolean;
}> = [
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

export function PricingClient() {
  const router = useRouter();
  const createCheckout = useCreateCheckout();
  const [pending, setPending] = useState<SubscriptionPlan | null>(null);

  async function onSelect(plan: SubscriptionPlan): Promise<void> {
    if (plan === "ENTERPRISE") {
      router.push("/contact-sales");
      return;
    }
    setPending(plan);
    try {
      const r = await createCheckout.mutateAsync({ plan });
      window.location.href = r.url;
    } catch (err) {
      // Unauthenticated → push to signup; otherwise surface the error.
      // 401 is the most common case on a public pricing page.
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status: number }).status
          : 0;
      if (status === 401) {
        const redirect = encodeURIComponent("/billing/checkout-success");
        router.push(`/signup?plan=${plan}&redirect=${redirect}`);
      } else {
        // eslint-disable-next-line no-console
        console.error("Failed to start checkout:", err);
      }
      setPending(null);
    }
  }

  return (
    <>
      <section className="border-b border-border bg-bg-primary">
        <div className="max-w-7xl mx-auto px-6 py-16 sm:py-24 text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent mb-6">
            14-day free trial · No credit card required
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-text-primary tracking-tight">
            Pricing that scales with your lot
          </h1>
          <p className="mt-4 text-lg text-text-muted max-w-2xl mx-auto">
            From single-rooftop starter stores to multi-rooftop dealer
            groups. Every plan includes the full CRM, inventory, and
            integrations suite.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4 text-sm text-text-muted">
            <span>Cancel anytime</span>
            <span aria-hidden="true">·</span>
            <span>Prorated upgrades</span>
            <span aria-hidden="true">·</span>
            <Link href="/contact-sales" className="text-accent hover:underline">
              Talk to sales
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-bg-primary">
        <div className="max-w-7xl mx-auto px-6 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((p) => (
              <PlanCard
                key={p.plan}
                plan={p.plan}
                label={p.label}
                price={p.price}
                tagline={p.tagline}
                features={p.features}
                isHighlighted={p.isHighlighted}
                isCustom={p.isCustom}
                isLoading={pending === p.plan}
                disabled={p.isCustom === true && pending !== null}
                onSelect={(plan) => void onSelect(plan)}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
