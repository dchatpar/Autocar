"use client";

/**
 * SignerList — read-only list of signers for a DocuSign envelope.
 *
 * Each row shows the signer's name, role, email, and a per-signer
 * status pill (created/sent/delivered/completed/declined). The
 * row for the signer's "your turn" state is highlighted with an
 * accent border.
 *
 * The list is purely presentational; mutations (void, embedded
 * URL) are owned by the parent and exposed via `onVoid` / `onSign`.
 *
 * Accessibility:
 *   - Uses semantic <ul> + <li>
 *   - Status pills are aria-labelled by the signer name + role
 *   - Action buttons have explicit aria-labels
 */

import { Mail, AlertCircle, CheckCircle2, Clock, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { EnvelopeSigner } from "@/hooks/useSignatures";

export interface SignerListProps {
  signers: EnvelopeSigner[];
  /** When true, show the inline "Sign now" button for embedded signers. */
  embeddedSigningAvailable?: boolean;
  /** Called when the user clicks "Sign now" on a signer row. */
  onSign?: (signer: EnvelopeSigner) => void;
  /** Called when the user clicks "Void envelope" (admin only). */
  onVoid?: () => void;
  /** Whether the current user can void envelopes. */
  canVoid?: boolean;
  className?: string;
}

const STATUS_LABEL: Record<EnvelopeSigner["status"], string> = {
  created: "Created",
  sent: "Sent",
  delivered: "Opened",
  completed: "Signed",
  declined: "Declined",
};

const STATUS_VARIANT: Record<EnvelopeSigner["status"], BadgeVariant> = {
  created: "muted",
  sent: "info",
  delivered: "accent",
  completed: "success",
  declined: "danger",
};

const STATUS_ICON: Record<EnvelopeSigner["status"], typeof Mail> = {
  created: Clock,
  sent: Send,
  delivered: Mail,
  completed: CheckCircle2,
  declined: AlertCircle,
};

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SignerList({
  signers,
  embeddedSigningAvailable = false,
  onSign,
  onVoid,
  canVoid = false,
  className,
}: SignerListProps) {
  if (signers.length === 0) {
    return (
      <p className="text-sm text-text-muted py-2">No signers on this envelope.</p>
    );
  }

  return (
    <ul className={cn("divide-y divide-border", className)}>
      {signers.map((signer, idx) => {
        const Icon = STATUS_ICON[signer.status];
        const isCompleted = signer.status === "completed";
        const isDeclined = signer.status === "declined";
        const canSign = !!onSign && !isCompleted && !isDeclined && embeddedSigningAvailable;
        const lastEvent =
          formatTimestamp(signer.signedAt) ??
          formatTimestamp(signer.deliveredAt) ??
          formatTimestamp(signer.declinedAt);

        return (
          <li
            key={`${signer.email}-${idx}`}
            className={cn(
              "flex items-center justify-between gap-3 py-3",
              isCompleted && "opacity-80",
            )}
            aria-label={`${signer.name}, ${signer.role}, ${STATUS_LABEL[signer.status]}`}
          >
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className={cn(
                  "mt-0.5 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
                  isCompleted
                    ? "bg-success/10 text-success"
                    : isDeclined
                    ? "bg-danger/10 text-danger"
                    : signer.status === "delivered"
                    ? "bg-accent/10 text-accent"
                    : "bg-bg-elevated text-text-muted",
                )}
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-text-primary truncate">
                    {signer.name}
                  </span>
                  <span className="text-xs text-text-muted">· {signer.role}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-muted truncate">{signer.email}</span>
                </div>
                {lastEvent && (
                  <div className="text-xs text-text-muted mt-1">
                    {isCompleted && "Signed "}
                    {isDeclined && "Declined "}
                    {!isCompleted && !isDeclined && signer.status === "delivered" && "Opened "}
                    {!isCompleted && !isDeclined && signer.status === "sent" && "Sent "}
                    {lastEvent}
                    {signer.declineReason && (
                      <span className="text-danger"> — {signer.declineReason}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant={STATUS_VARIANT[signer.status]}>
                {STATUS_LABEL[signer.status]}
              </Badge>
              {canSign && (
                <button
                  type="button"
                  onClick={() => onSign(signer)}
                  className="text-xs h-8 px-3 rounded-md bg-accent text-bg-primary hover:bg-[#d4e639] active:scale-[0.98] transition-all font-medium"
                  aria-label={`Open signing for ${signer.name}`}
                >
                  Sign now
                </button>
              )}
            </div>
          </li>
        );
      })}

      {canVoid && onVoid && (
        <li className="pt-3 flex justify-end">
          <button
            type="button"
            onClick={onVoid}
            className="text-xs h-8 px-3 rounded-md border border-border text-text-muted hover:text-danger hover:border-danger transition-colors inline-flex items-center gap-1.5"
            aria-label="Void this envelope"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Void envelope
          </button>
        </li>
      )}
    </ul>
  );
}
