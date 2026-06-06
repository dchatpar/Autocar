"use client";

/**
 * SignatureStatus — colour-coded status pill for an envelope.
 *
 * Maps the `SignatureStatus` enum to one of the design-system's
 * badge variants. Used in the deal signature list, the deal
 * detail page, and the embedded signing iframe header.
 *
 * Visual mapping:
 *   CREATED     → muted     (still in our DB, not yet sent)
 *   SENT        → info      (DocuSign has the envelope, waiting)
 *   DELIVERED   → accent    (signer has opened it, action needed)
 *   COMPLETED   → success   (all parties signed)
 *   DECLINED    → danger    (a signer refused — needs follow-up)
 *   VOIDED      → muted     (we cancelled it)
 *   EXPIRED     → warning   (timed out)
 *
 * Sizes:
 *   - `sm` (default) — used in dense lists
 *   - `md`           — used on the envelope detail header
 */

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SignatureStatus as Status } from "@/hooks/useSignatures";

export interface SignatureStatusProps {
  status: Status;
  size?: "sm" | "md";
  className?: string;
  /** Show a dot indicator before the label. Default true. */
  showDot?: boolean;
}

const LABEL: Record<Status, string> = {
  CREATED: "Draft",
  SENT: "Sent",
  DELIVERED: "Awaiting signature",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  VOIDED: "Voided",
  EXPIRED: "Expired",
};

const VARIANT: Record<Status, BadgeVariant> = {
  CREATED: "muted",
  SENT: "info",
  DELIVERED: "accent",
  COMPLETED: "success",
  DECLINED: "danger",
  VOIDED: "muted",
  EXPIRED: "warning",
};

const DOT_COLOR: Record<Status, string> = {
  CREATED: "bg-text-muted",
  SENT: "bg-info",
  DELIVERED: "bg-accent",
  COMPLETED: "bg-success",
  DECLINED: "bg-danger",
  VOIDED: "bg-text-muted",
  EXPIRED: "bg-warning",
};

export function SignatureStatus({
  status,
  size = "sm",
  className,
  showDot = true,
}: SignatureStatusProps) {
  const sizeClass = size === "md" ? "text-sm px-3 py-1" : "text-xs px-2.5 py-0.5";
  return (
    <Badge
      variant={VARIANT[status]}
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        sizeClass,
        className,
      )}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            DOT_COLOR[status],
          )}
        />
      )}
      <span>{LABEL[status]}</span>
    </Badge>
  );
}

export function getSignatureStatusLabel(status: Status): string {
  return LABEL[status];
}

export function getSignatureStatusVariant(status: Status): BadgeVariant {
  return VARIANT[status];
}
