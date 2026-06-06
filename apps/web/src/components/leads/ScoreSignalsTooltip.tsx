"use client";

/**
 * ScoreSignalsTooltip — hover/focus tooltip showing the top contributing
 * signals for a lead's score. Lives next to ScoreBadge so the breakdown
 * is discoverable without leaving the list view.
 *
 * No third-party tooltip dep — we hand-roll a small accessible popover
 * so it works inside tight grid cells without portal / overflow
 * collisions.
 */

import { useId, useState } from "react";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScoreSignalEntry {
  /** Rule id from the API (e.g. "hasEmail", "hasAppointment"). */
  rule: string;
  /** Signed delta applied by this rule. */
  delta: number;
  /** Human-readable label. */
  label: string;
}

export interface ScoreSignalsTooltipProps {
  signals: Record<string, number> | null;
  topSignals: ReadonlyArray<ScoreSignalEntry> | null;
  children: React.ReactNode;
  className?: string;
}

const RULE_DESCRIPTIONS: Record<string, string> = {
  hasEmail: "Has email",
  hasPhone: "Has valid phone",
  vehicleInInventory: "Vehicle is in our inventory",
  budgetSpecified: "Budget specified",
  contactedUnder24h: "Contacted within 24h of creation",
  hasResponded: "Responded (message, email open, or appointment)",
  hasAppointment: "Appointment scheduled",
  hasReplied: "Replied to outreach",
  highIntentSource: "High-intent source",
  referralOrRepeat: "Referral or repeat customer",
  noResponseAfter3Attempts: "No response after 3+ attempts",
  overdue7Days: "No contact in over 7 days",
  unsubscribed: "Unsubscribed or marked not interested",
  bouncedContact: "Email or phone is invalid/bounced",
  lowQualitySource: "Low-quality source",
  duplicateOfCustomer: "Duplicate of existing customer",
};

const POSITIVE_ICON: LucideIcon = TrendingUp;
const NEGATIVE_ICON: LucideIcon = TrendingDown;

function fmtDelta(d: number): string {
  if (d > 0) return `+${d}`;
  return `${d}`;
}

export function ScoreSignalsTooltip({
  signals,
  topSignals,
  children,
  className,
}: ScoreSignalsTooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const entries: ScoreSignalEntry[] =
    topSignals && topSignals.length > 0
      ? [...topSignals]
      : signals
        ? Object.entries(signals)
            .filter(([, v]) => v !== 0)
            .map(([rule, delta]) => ({
              rule,
              delta,
              label: RULE_DESCRIPTIONS[rule] ?? rule,
            }))
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 3)
        : [];

  if (entries.length === 0) return <>{children}</>;

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          id={id}
          className={cn(
            "absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-72",
            "bg-bg-card border border-border rounded-lg shadow-2xl p-3",
            "animate-fade-in",
          )}
        >
          <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-2">
            Top scoring signals
          </p>
          <ul className="space-y-1.5">
            {entries.map((entry) => {
              const Icon = entry.delta >= 0 ? POSITIVE_ICON : NEGATIVE_ICON;
              const tone =
                entry.delta >= 0
                  ? "text-[#22D3A0]"
                  : "text-[#EF4444]";
              return (
                <li
                  key={entry.rule}
                  className="flex items-start gap-2 text-xs"
                >
                  <Icon
                    className={cn("h-3.5 w-3.5 flex-shrink-0 mt-0.5", tone)}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-text-primary leading-snug">
                    {entry.label}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums font-semibold flex-shrink-0",
                      tone,
                    )}
                    aria-label={`${fmtDelta(entry.delta)} points`}
                  >
                    {fmtDelta(entry.delta)}
                  </span>
                </li>
              );
            })}
          </ul>
          {/* Arrow */}
          <span
            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-bg-card border-l border-t border-border"
            aria-hidden="true"
          />
        </div>
      )}
    </span>
  );
}
