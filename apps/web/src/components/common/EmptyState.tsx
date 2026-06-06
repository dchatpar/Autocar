"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface EmptyStateAction {
  label: string;
  /** Either onClick OR href should be provided. */
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  href?: string;
  icon?: ReactNode;
}

export interface EmptyStateProps {
  /** Lucide icon or custom element. Falls back to inbox-style icon. */
  icon?: ReactNode;
  /** Short headline. Keep under 8 words for visual balance. */
  title: string;
  /** One-sentence explanation of why this is empty. */
  description: string;
  /** Primary call to action (e.g. "Add Lead"). */
  primaryAction?: EmptyStateAction;
  /** Secondary action (e.g. "Learn more"). */
  secondaryAction?: EmptyStateAction;
  /** Optional decorative tone — defaults to muted card style. */
  tone?: "default" | "accent" | "danger";
  className?: string;
}

/**
 * EmptyState — reusable zero-data component for leads, customers,
 * inventory, and any list/table view.
 *
 * Visual hierarchy: Icon → Title → Description → Actions
 * Centered, 44px+ tap targets, accessible role + labels.
 */
export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  tone = "default",
  className,
}: EmptyStateProps) {
  const iconWrapClass = cn(
    "h-14 w-14 rounded-2xl flex items-center justify-center mb-5",
    tone === "default" && "bg-bg-elevated text-text-muted border border-border",
    tone === "accent" && "bg-accent/10 text-accent border border-accent/20",
    tone === "danger" && "bg-danger/10 text-danger border border-danger/20"
  );

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-12 md:py-16",
        "rounded-2xl border border-border bg-bg-card",
        className
      )}
    >
      <div className={iconWrapClass} aria-hidden="true">
        {icon ?? <DefaultEmptyIcon />}
      </div>

      <h3 className="text-lg font-semibold text-text-primary mb-1.5">
        {title}
      </h3>
      <p className="text-sm text-text-muted max-w-md mb-6 leading-relaxed">
        {description}
      </p>

      {(primaryAction || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {primaryAction && (
            <Button
              variant={primaryAction.variant ?? "primary"}
              size="md"
              onClick={primaryAction.onClick}
            >
              {primaryAction.icon}
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant ?? "ghost"}
              size="md"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.icon}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function DefaultEmptyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      <path d="M21 8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z" />
      <path d="m3 8 4.5 5 3.5-4 4 5 6-6" />
    </svg>
  );
}
