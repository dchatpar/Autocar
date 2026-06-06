"use client";

import * as React from "react";

/**
 * AnomalyBadge — compact, accessible indicator for suspicious
 * activity events. Renders a coloured pill with the most-severe
 * reason. Dark-mode aware (uses semantic tokens from globals.css).
 *
 * Designed to be embedded in a row of `ActivityTimeline` and on
 * the Anomalies tab of the activity-logs page.
 */

import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnomalySeverity } from "@/hooks/useActivityLogs";

export interface AnomalyBadgeProps {
  severity?: AnomalySeverity | null;
  reasons?: ReadonlyArray<{ reason: string; severity: AnomalySeverity }>;
  className?: string;
  showLabel?: boolean;
}

const SEVERITY_RANK: Record<AnomalySeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function highestSeverity(
  reasons: ReadonlyArray<{ reason: string; severity: AnomalySeverity }>,
): AnomalySeverity | null {
  if (reasons.length === 0) return null;
  let top: AnomalySeverity | null = null;
  let topRank = 0;
  for (const r of reasons) {
    if (SEVERITY_RANK[r.severity] > topRank) {
      top = r.severity;
      topRank = SEVERITY_RANK[r.severity];
    }
  }
  return top;
}

function humanize(reason: string): string {
  return reason
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export function AnomalyBadge({
  severity,
  reasons,
  className,
  showLabel = true,
}: AnomalyBadgeProps): React.ReactElement | null {
  const list = reasons ?? [];
  const effective = severity ?? highestSeverity(list);
  if (!effective) return null;

  const tone = TONE_CLASSES[effective];
  const Icon = ICON_FOR[effective];
  const reasonLabel = list.length > 0 ? humanize(list[0]!.reason) : null;
  const moreCount = list.length > 1 ? list.length - 1 : 0;
  const ariaLabel = `Anomaly: ${effective}${reasonLabel ? `, ${reasonLabel}` : ""}${
    moreCount > 0 ? `, and ${moreCount} more` : ""
  }`;

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {showLabel ? (
        <span>
          {effective === "low" ? "Notice" : effective === "medium" ? "Caution" : "Alert"}
          {reasonLabel ? ` · ${reasonLabel}` : ""}
          {moreCount > 0 ? ` +${moreCount}` : ""}
        </span>
      ) : null}
    </span>
  );
}

const TONE_CLASSES: Record<AnomalySeverity, string> = {
  low: "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  medium:
    "border-orange-500/30 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  high: "border-red-500/40 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

const ICON_FOR: Record<AnomalySeverity, typeof AlertTriangle> = {
  low: AlertTriangle,
  medium: ShieldAlert,
  high: ShieldX,
};

/* ============================================================
 * AnomalyDot — small dot-only variant for dense timelines
 * ============================================================ */

export function AnomalyDot({
  severity,
  title,
}: {
  severity: AnomalySeverity;
  title?: string;
}): React.ReactElement {
  return (
    <span
      aria-label={title ?? `Anomaly ${severity}`}
      title={title ?? severity}
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        severity === "low" && "bg-amber-500",
        severity === "medium" && "bg-orange-500",
        severity === "high" && "bg-red-500",
      )}
    />
  );
}

/* ============================================================
 * StatusOK — paired visual indicating normal (non-anomalous) state
 * ============================================================ */

export function StatusOK({ className }: { className?: string }): React.ReactElement {
  return (
    <span
      aria-label="Normal activity"
      className={cn(
        "inline-flex h-2 w-2 rounded-full bg-emerald-500/80",
        className,
      )}
    />
  );
}

/* Re-export ShieldCheck for callers that prefer a richer icon */
export { ShieldCheck };
