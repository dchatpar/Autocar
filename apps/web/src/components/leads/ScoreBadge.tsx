"use client";

/**
 * ScoreBadge — 0–100 lead score pill with WCAG-friendly color + icon + label.
 *
 * Tiers:
 *   0–30   cold   (red)
 *   31–60  warm   (yellow / warning)
 *   61–100 hot    (green / success)
 *
 * Color is paired with an icon and a text label so the badge is
 * readable for color-blind users. Optionally shows the top 3
 * contributing signals on hover via ScoreSignalsTooltip.
 */

import { Flame, Sun, Snowflake, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreSignalsTooltip, type ScoreSignalsTooltipProps } from "./ScoreSignalsTooltip";

export type Classification = "cold" | "warm" | "hot";

export interface ScoreBadgeProps {
  score: number;
  classification?: Classification;
  signals?: ScoreSignalsTooltipProps["signals"];
  topSignals?: ScoreSignalsTooltipProps["topSignals"];
  /** Show a chip with the textual label (default true). */
  showLabel?: boolean;
  /** Show the numeric score (default true). */
  showNumber?: boolean;
  /** Sizing. */
  size?: "xs" | "sm" | "md";
  className?: string;
}

interface TierStyle {
  icon: LucideIcon;
  label: string;
  containerClass: string;
  iconClass: string;
  textClass: string;
}

const TIERS: Record<Classification, TierStyle> = {
  cold: {
    icon: Snowflake,
    label: "Cold",
    containerClass: "bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.35)]",
    iconClass: "text-[#EF4444]",
    textClass: "text-[#EF4444]",
  },
  warm: {
    icon: Sun,
    label: "Warm",
    containerClass: "bg-[rgba(249,115,22,0.12)] border-[rgba(249,115,22,0.35)]",
    iconClass: "text-[#F97316]",
    textClass: "text-[#F97316]",
  },
  hot: {
    icon: Flame,
    label: "Hot",
    containerClass: "bg-[rgba(34,211,160,0.12)] border-[rgba(34,211,160,0.35)]",
    iconClass: "text-[#22D3A0]",
    textClass: "text-[#22D3A0]",
  },
};

function deriveClassification(score: number): Classification {
  if (score <= 30) return "cold";
  if (score <= 60) return "warm";
  return "hot";
}

const SIZE_CLASSES: Record<NonNullable<ScoreBadgeProps["size"]>, string> = {
  xs: "h-5 px-1.5 text-[10px] gap-1",
  sm: "h-6 px-2 text-xs gap-1.5",
  md: "h-7 px-2.5 text-sm gap-1.5",
};

const ICON_SIZE: Record<NonNullable<ScoreBadgeProps["size"]>, number> = {
  xs: 10,
  sm: 12,
  md: 14,
};

export function ScoreBadge({
  score,
  classification,
  signals,
  topSignals,
  showLabel = true,
  showNumber = true,
  size = "sm",
  className,
}: ScoreBadgeProps) {
  const tier = TIERS[classification ?? deriveClassification(score)];
  const Icon = tier.icon;
  const accessible = `Lead score ${score} out of 100, ${tier.label}`;

  // The badge itself is a static visual — the tooltip wrapper provides
  // interactive hover/focus. We always render the tooltip when signals
  // are present so the breakdown is discoverable.
  const inner = (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold leading-none whitespace-nowrap",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
        tier.containerClass,
        SIZE_CLASSES[size],
        className,
      )}
      role="status"
      aria-label={accessible}
      tabIndex={signals || topSignals ? 0 : undefined}
    >
      <Icon
        className={tier.iconClass}
        style={{ width: ICON_SIZE[size], height: ICON_SIZE[size] }}
        aria-hidden="true"
      />
      {showNumber && (
        <span className={cn("tabular-nums", tier.textClass)}>{score}</span>
      )}
      {showLabel && (
        <span className={cn(tier.textClass, "font-medium")}>{tier.label}</span>
      )}
    </span>
  );

  if (!signals && !topSignals) return inner;

  return (
    <ScoreSignalsTooltip signals={signals ?? null} topSignals={topSignals ?? null}>
      {inner}
    </ScoreSignalsTooltip>
  );
}

/**
 * Variant for the Kanban / table card — minimal: icon + number, no label.
 * Keeps the card compact while still surfacing the score.
 */
export function ScoreBadgeCompact(props: Omit<ScoreBadgeProps, "showLabel" | "size">) {
  return <ScoreBadge {...props} showLabel={false} size="xs" />;
}

/**
 * Variant showing the score as a horizontal progress-style bar.
 * Useful for dashboard widgets and the lead detail header.
 */
export interface ScoreBarProps {
  score: number;
  classification?: Classification;
  className?: string;
  showTrendIcon?: boolean;
}

export function ScoreBar({
  score,
  classification,
  className,
  showTrendIcon = false,
}: ScoreBarProps) {
  const tier = TIERS[classification ?? deriveClassification(score)];
  const Icon = tier.icon;
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
      aria-label={`Lead score ${score} of 100 (${tier.label})`}
    >
      <div className="relative h-1.5 flex-1 rounded-full bg-bg-elevated overflow-hidden min-w-[60px]">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all",
            tier.iconClass,
            "bg-current",
          )}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
      <div className="flex items-center gap-1 tabular-nums text-xs font-semibold">
        {showTrendIcon && <TrendingUp className="h-3 w-3 text-text-muted" aria-hidden="true" />}
        <Icon className={cn("h-3 w-3", tier.iconClass)} aria-hidden="true" />
        <span className={tier.textClass}>{score}</span>
      </div>
    </div>
  );
}
