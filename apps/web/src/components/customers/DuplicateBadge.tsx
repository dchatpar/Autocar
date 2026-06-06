"use client";

/**
 * DuplicateBadge — small chip rendered next to a customer name when
 * the duplicate detector has flagged or auto-merged them. Click to
 * open the compare modal.
 *
 * Tooltip lists the top reasons ("email match", "phone last-7 match",
 * "first name 92% match") so the operator knows why we think this
 * is a duplicate without opening the modal first.
 */

import { useState, useId } from "react";
import { Copy, AlertTriangle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type DuplicateBadgeKind = "flag" | "auto_merge";

export interface DuplicateBadgeProps {
  kind: DuplicateBadgeKind;
  reasons: ReadonlyArray<string>;
  score?: number;
  onClick?: () => void;
  className?: string;
  /** When true, the badge is rendered as a static pill (no button). */
  staticOnly?: boolean;
}

const KIND_STYLES: Record<DuplicateBadgeKind, { bg: string; fg: string; ring: string; label: string; icon: React.ReactNode }> = {
  flag: {
    bg: "bg-warning/10",
    fg: "text-warning",
    ring: "ring-warning/30",
    label: "Possible duplicate",
    icon: <AlertTriangle className="h-3 w-3" aria-hidden="true" />,
  },
  auto_merge: {
    bg: "bg-accent/10",
    fg: "text-accent",
    ring: "ring-accent/40",
    label: "Auto-merge candidate",
    icon: <Sparkles className="h-3 w-3" aria-hidden="true" />,
  },
};

export function DuplicateBadge({
  kind,
  reasons,
  score,
  onClick,
  className,
  staticOnly = false,
}: DuplicateBadgeProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const style = KIND_STYLES[kind];

  // Tooltip text — top 3 reasons + optional score.
  const tooltip = [
    ...reasons.slice(0, 3),
    ...(typeof score === "number" ? [`score ${Math.round(score * 100)}%`] : []),
  ].join(" · ");

  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
        style.bg,
        style.fg,
        style.ring,
        !staticOnly && onClick
          ? "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          : "",
        className,
      )}
      onClick={onClick}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : "status"}
      aria-describedby={open ? tooltipId : undefined}
      aria-label={`${style.label}. ${tooltip}`}
    >
      {style.icon}
      <span>{style.label}</span>
      {typeof score === "number" && (
        <span className="ml-0.5 opacity-75">{Math.round(score * 100)}%</span>
      )}
    </span>
  );

  return (
    <span className="relative inline-flex">
      {content}
      {open && tooltip && (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute z-50 top-full left-1/2 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary shadow-lg"
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}

/** Compact "duplicate" indicator for use in dense lists. */
export function DuplicateDot({
  className,
  title = "Has possible duplicate",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center rounded-full bg-warning/15 text-warning",
        className,
      )}
      title={title}
      aria-label={title}
    >
      <Copy className="h-2.5 w-2.5" aria-hidden="true" />
    </span>
  );
}
