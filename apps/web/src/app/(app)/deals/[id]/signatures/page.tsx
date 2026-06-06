"use client";

/**
 * /deals/[id]/signatures — list of DocuSign envelopes for a deal.
 *
 * Layout:
 *   - Page header with "Send for signature" CTA
 *   - Per-envelope cards with subject, signers, status, actions
 *   - Each card shows the SignerList and lets the dealer:
 *       - Open the embedded signing iframe (per signer)
 *       - Void the envelope (admin/manager only)
 *       - Download the signed PDF (when completed)
 *
 * The list re-fetches on a 10s interval while at least one envelope
 * is in-flight; once all are terminal, polling stops.
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FileSignature, Loader2, Plus, ArrowLeft } from "lucide-react";
import { PageHeader, PageContainer } from "@/components/layout";
import { EmptyState } from "@/components/common/EmptyState";
import { SendForSignatureModal } from "@/components/deals/SendForSignatureModal";
import { SignerList } from "@/components/deals/SignerList";
import { SignatureStatus } from "@/components/deals/SignatureStatus";
import { Button } from "@/components/ui/button";
import {
  useEnvelopesForDeal,
  useVoidEnvelope,
  type Envelope,
  type EnvelopeSigner,
} from "@/hooks/useSignatures";
import { useAuth } from "@/hooks/useAuth";

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DealSignaturesPage() {
  const params = useParams<{ id: string }>();
  const dealId = params?.id ?? "";
  const router = useRouter();
  const { user } = useAuth();
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Envelope | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const {
    data: envelopes = [],
    isLoading,
    refetch,
  } = useEnvelopesForDeal(dealId);

  const voidMutation = useVoidEnvelope();

  const userRole = user?.role ?? "";
  const canVoid = ["ADMIN", "MANAGER", "FINANCE"].includes(
    userRole.toUpperCase(),
  );

  const sortedEnvelopes = useMemo(
    () => [...envelopes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [envelopes],
  );

  async function handleVoid() {
    if (!voidTarget || !voidReason.trim()) return;
    await voidMutation.mutateAsync({ id: voidTarget.id, reason: voidReason.trim() });
    setVoidTarget(null);
    setVoidReason("");
    void refetch();
  }

  function handleSign(signer: EnvelopeSigner, envelope: Envelope) {
    router.push(
      `/deals/${dealId}/sign/${envelope.id}?signer=${encodeURIComponent(signer.email)}`,
    );
  }

  function downloadPdf(envelope: Envelope) {
    // Open in a new tab; the browser attaches the Bearer token via
    // the cookie. For the demo, we navigate directly.
    const url = `/signatures/envelopes/${envelope.id}/pdf`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <PageContainer>
      <PageHeader
        title="E-signatures"
        description={`DocuSign envelopes for deal ${dealId}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/deals/${dealId}`}>
              <Button variant="secondary" size="sm">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Back to deal
              </Button>
            </Link>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setSendModalOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Send for signature
            </Button>
          </div>
        }
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-text-muted py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading envelopes…
        </div>
      )}

      {!isLoading && sortedEnvelopes.length === 0 && (
        <EmptyState
          icon={<FileSignature className="h-6 w-6" aria-hidden="true" />}
          title="No signatures yet"
          description="Send the bill of sale, F&I contract, or any other deal document for e-signature."
          primaryAction={{
            label: "Send for signature",
            onClick: () => setSendModalOpen(true),
            icon: <Plus className="h-4 w-4" aria-hidden="true" />,
          }}
          tone="accent"
        />
      )}

      <div className="space-y-4">
        {sortedEnvelopes.map((envelope) => (
          <article
            key={envelope.id}
            className="bg-bg-card border border-border rounded-xl p-4"
            aria-label={`Envelope: ${envelope.subject ?? envelope.documentType}`}
          >
            <header className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <SignatureStatus status={envelope.status} size="md" />
                  <span className="text-xs uppercase tracking-wide text-text-muted">
                    {envelope.documentType.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-text-primary mt-1.5 truncate">
                  {envelope.subject ?? `Envelope ${envelope.envelopeId}`}
                </h3>
                <p className="text-xs text-text-muted mt-1">
                  Sent {formatTimestamp(envelope.sentAt) ?? "—"}
                  {envelope.completedAt && (
                    <> · Completed {formatTimestamp(envelope.completedAt)}</>
                  )}
                  {envelope.declinedAt && (
                    <> · Declined {formatTimestamp(envelope.declinedAt)}</>
                  )}
                  {envelope.voidedAt && (
                    <> · Voided {formatTimestamp(envelope.voidedAt)}</>
                  )}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {envelope.status === "COMPLETED" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => downloadPdf(envelope)}
                  >
                    Download PDF
                  </Button>
                )}
              </div>
            </header>

            <SignerList
              signers={envelope.signers}
              embeddedSigningAvailable={
                envelope.status === "SENT" ||
                envelope.status === "DELIVERED" ||
                envelope.status === "CREATED"
              }
              onSign={(signer) => handleSign(signer, envelope)}
              onVoid={
                canVoid &&
                envelope.status !== "COMPLETED" &&
                envelope.status !== "VOIDED" &&
                envelope.status !== "DECLINED" &&
                envelope.status !== "EXPIRED"
                  ? () => setVoidTarget(envelope)
                  : undefined
              }
              canVoid={
                canVoid &&
                envelope.status !== "COMPLETED" &&
                envelope.status !== "VOIDED" &&
                envelope.status !== "DECLINED" &&
                envelope.status !== "EXPIRED"
              }
            />
          </article>
        ))}
      </div>

      <SendForSignatureModal
        isOpen={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        dealId={dealId}
        onCreated={() => {
          void refetch();
        }}
      />

      {voidTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 backdrop-blur-modal"
            onClick={() => setVoidTarget(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-bg-card border border-border rounded-xl shadow-2xl p-4">
            <h3 className="text-lg font-semibold text-text-primary">
              Void envelope?
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              This cancels the envelope in DocuSign. All signers will be
              notified that the document is no longer available.
            </p>
            <label className="block mt-3 text-sm text-text-primary">
              Reason
              <input
                type="text"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Buyer changed terms"
                className="mt-1 w-full h-9 rounded-md border border-border bg-bg-primary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="h-9 px-3 rounded-md text-sm text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={voidMutation.isPending || !voidReason.trim()}
                className="h-9 px-4 rounded-md bg-danger text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {voidMutation.isPending ? "Voiding…" : "Void envelope"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
