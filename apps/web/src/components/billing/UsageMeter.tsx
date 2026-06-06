"use client";

/**
 * UsageMeter — horizontal bar showing one meter's current usage
 * against the plan cap. Renders "x of y" with a percent fill.
 *
 * Color states:
 *   - < 75 %   → accent
 *   - 75–95 %  → warning
 *   - ≥ 95 %   → danger
 *   - null cap → "Unlimited" tag
 */

import { cn } from "@/lib/utils";
import { metricLabel } from "@/hooks/useBilling";

export interface UsageMeterProps {
  metric: string;
  quantity: number;
  /** null = unlimited. */
  cap: number | null;
  /** 0–1 ratio; null = unlimited. */
  pct: number | null;
  /** Optional override for the metric label. */
  label?: string;
  className?: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function UsageMeter({
  metric,
  quantity,
  cap,
  pct,
  label,
  className,
}: UsageMeterProps) {
  const displayLabel = label ?? metricLabel(metric);
  const unlimited = cap === null;
  const ratio = unlimited ? 0 : Math.max(0, Math.min(pct ?? 0, 1));
  const pctText = unlimited
    ? "Unlimited"
    : cap !== null
    ? `${Math.round(ratio * 100)}%`
    : "—";
  const fillColor = unlimited
    ? "bg-accent"
    : ratio >= 0.95
    ? "bg-danger"
    : ratio >= 0.75
    ? "bg-warning"
    : "bg-accent";

  return (
    <div
      data-metric={metric}
      className={cn(
        "rounded-lg border border-border bg-bg-elevated p-4",
        className,
      )}
      role="group"
      aria-label={`${displayLabel} usage`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-text-primary">
          {displayLabel}
        </span>
        <span className="text-xs text-text-muted">{pctText}</span>
      </div>

      <div
        className="w-full h-2 rounded-full bg-bg-primary overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label={`${displayLabel} usage`}
      >
        <div
          className={cn("h-full rounded-full transition-all", fillColor)}
          style={{ width: unlimited ? "100%" : `${ratio * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
        <span>
          {formatNumber(quantity)} used
        </span>
        <span>
          {unlimited ? "No cap on this plan" : `${formatNumber(quantity)} of ${formatNumber(cap ?? 0)}`}
        </span>
      </div>
    </div>
  );
}
