"use client";

/**
 * PlanCard — pricing-page tile for a single subscription tier.
 *
 * Variants:
 *   - "default" — used on the public /pricing page
 *   - "current" — highlights the dealer's current plan
 *   - "compact" — used inside the dashboard side-by-side comparison
 *
 * The card's CTA calls the `onSelect(plan)` callback. The parent
 * (pricing page or settings page) decides whether to trigger a
 * Stripe Checkout redirect or a self-service upgrade.
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/api";

export interface PlanCardProps {
  plan: SubscriptionPlan;
  label: string;
  price: number; // USD/month
  tagline: string;
  features: ReadonlyArray<string>;
  /** True if this is the dealer's current plan. */
  isCurrent?: boolean;
  /** True if this is the "best value" tier — renders a badge. */
  isHighlighted?: boolean;
  /** True if this is a custom-tier plan (e.g. Enterprise). */
  isCustom?: boolean;
  /** Optional billing period label override. */
  periodLabel?: string;
  /** Show the "downgrade" wording on the CTA. */
  isDowngrade?: boolean;
  /** Disable the CTA (e.g. already on this plan + on the same plan). */
  disabled?: boolean;
  /** Loading state. */
  isLoading?: boolean;
  /** Compact mode (smaller card for the dashboard). */
  variant?: "default" | "compact";
  /** Click handler. */
  onSelect?: (plan: SubscriptionPlan) => void;
}

export function PlanCard(props: PlanCardProps) {
  const {
    plan,
    label,
    price,
    tagline,
    features,
    isCurrent = false,
    isHighlighted = false,
    isCustom = false,
    periodLabel = "/ month",
    isDowngrade = false,
    disabled = false,
    isLoading = false,
    variant = "default",
    onSelect,
  } = props;

  const compact = variant === "compact";
  const ctaLabel = isCurrent
    ? "Current plan"
    : isCustom
    ? "Contact sales"
    : isDowngrade
    ? `Downgrade to ${label}`
    : `Upgrade to ${label}`;

  return (
    <div
      data-plan={plan}
      className={cn(
        "relative flex flex-col rounded-2xl border bg-bg-card p-6 transition-all",
        isHighlighted
          ? "border-accent shadow-lg shadow-accent/10 ring-1 ring-accent/40"
          : "border-border",
        compact ? "min-h-[360px]" : "min-h-[480px]",
      )}
    >
      {/* Highlight badge */}
      {isHighlighted && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="accent" className="px-3 py-1">
            <Sparkles className="h-3 w-3 mr-1" aria-hidden="true" />
            Most popular
          </Badge>
        </div>
      )}

      {/* Current badge */}
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="success" className="px-3 py-1">
            <Check className="h-3 w-3 mr-1" aria-hidden="true" />
            Current plan
          </Badge>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-xl font-semibold text-text-primary">{label}</h3>
        <p className="mt-1 text-sm text-text-muted">{tagline}</p>
      </div>

      <div className="mb-6">
        {isCustom ? (
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-text-primary">Custom</span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-text-primary">
              ${price}
            </span>
            <span className="text-sm text-text-muted">{periodLabel}</span>
          </div>
        )}
      </div>

      <ul
        className="mb-6 space-y-3 text-sm text-text-primary flex-1"
        aria-label={`${label} plan features`}
      >
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check
              className="h-4 w-4 text-accent flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant={isCurrent ? "secondary" : isHighlighted ? "primary" : "secondary"}
        size="md"
        className="w-full min-h-[44px]"
        disabled={disabled || isCurrent}
        isLoading={isLoading}
        onClick={() => onSelect?.(plan)}
        aria-label={ctaLabel}
      >
        {isCurrent ? "Your current plan" : ctaLabel}
      </Button>
    </div>
  );
}
