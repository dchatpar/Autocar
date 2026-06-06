"use client";

/**
 * /deals/[id]/sign/[envelopeId] — embedded DocuSign signing iframe.
 *
 * The page requests a one-time signing URL for a specific signer
 * (passed as `?signer=email`) and renders the DocuSign signing
 * experience inline as an iframe.
 *
 * Polling:
 *   - While the iframe is open, we poll the envelope status every
 *     10s. When the envelope reaches a terminal state (COMPLETED,
 *     DECLINED, VOIDED, EXPIRED), we stop polling and surface the
 *     result to the user with a CTA to return to the deal.
 *
 * The DocuSign iframe calls its `returnUrl` when the signer closes
 * the embedded UI. We use that as a hint to refetch status — but
 * the webhook handler is the source of truth for status changes.
 */

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { PageHeader, PageContainer } from "@/components/layout";
import { SignatureStatus } from "@/components/deals/SignatureStatus";
import { SignerList } from "@/components/deals/SignerList";
import { Button } from "@/components/ui/button";
import {
  useEmbeddedSigningUrl,
  useEnvelope,
} from "@/hooks/useSignatures";

export default function EmbeddedSignPage() {
  const params = useParams<{ id: string; envelopeId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const dealId = params?.id ?? "";
  const envelopeId = params?.envelopeId ?? "";
  const signerEmail = search?.get("signer") ?? "";

  const {
    data: envelope,
    isLoading,
    refetch,
  } = useEnvelope(envelopeId, { pollMs: 10_000 });

  const embedded = useEmbeddedSigningUrl();
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasRequested, setHasRequested] = useState(false);

  // Request a one-time embedded URL once we know the signer email.
  useEffect(() => {
    if (!envelope || !signerEmail || hasRequested) return;
    if (iframeUrl) return;
    setHasRequested(true);
    const returnUrl = `${window.location.origin}/deals/${dealId}/sign/${envelopeId}?signer=${encodeURIComponent(
      signerEmail,
    )}&done=1`;
    embedded
      .mutateAsync({ id: envelopeId, signerEmail, returnUrl })
      .then((res) => setIframeUrl(res.url))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load signing session");
        setHasRequested(false);
      });
  }, [envelope, signerEmail, envelopeId, dealId, hasRequested, iframeUrl, embedded]);

  const isComplete = envelope?.status === "COMPLETED";
  const isVoided = envelope?.status === "VOIDED";
  const isDeclined = envelope?.status === "DECLINED";
  const isExpired = envelope?.status === "EXPIRED";
  const isTerminal = isComplete || isVoided || isDeclined || isExpired;

  return (
    <PageContainer>
      <PageHeader
        title="Sign document"
        description={
          envelope?.subject ?? `Envelope ${envelopeId}`
        }
        actions={
          <Link href={`/deals/${dealId}/signatures`}>
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Back to envelopes
            </Button>
          </Link>
        }
      />

      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            {envelope && <SignatureStatus status={envelope.status} size="md" />}
            <div className="min-w-0">
              <p className="text-sm text-text-primary truncate">
                {envelope?.documentType.replace(/_/g, " ").toLowerCase()}
              </p>
              <p className="text-xs text-text-muted">
                Signing as <span className="font-medium text-text-primary">{signerEmail}</span>
              </p>
            </div>
          </div>
          {iframeUrl && !isTerminal && (
            <a
              href={iframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-text-muted hover:text-text-primary hover:border-accent transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Open in new tab
            </a>
          )}
        </div>

        {/* Status surface */}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-text-muted py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading envelope…
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="m-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-md p-3"
          >
            {error}
          </div>
        )}

        {envelope && !isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] divide-y lg:divide-y-0 lg:divide-x divide-border">
            <div className="bg-bg-elevated min-h-[640px] relative">
              {isComplete && (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div className="bg-bg-card border border-border rounded-xl p-6 text-center max-w-md">
                    <CheckCircle2
                      className="h-12 w-12 text-success mx-auto mb-3"
                      aria-hidden="true"
                    />
                    <h3 className="text-lg font-semibold text-text-primary">
                      Signing complete
                    </h3>
                    <p className="text-sm text-text-muted mt-1">
                      All parties have signed. The signed PDF is available on the envelopes page.
                    </p>
                    <Link
                      href={`/deals/${dealId}/signatures`}
                      className="mt-4 inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent text-bg-primary text-sm font-medium hover:bg-[#d4e639]"
                    >
                      Back to envelopes
                    </Link>
                  </div>
                </div>
              )}

              {(isVoided || isDeclined || isExpired) && (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div className="bg-bg-card border border-border rounded-xl p-6 text-center max-w-md">
                    <XCircle
                      className="h-12 w-12 text-danger mx-auto mb-3"
                      aria-hidden="true"
                    />
                    <h3 className="text-lg font-semibold text-text-primary">
                      {isVoided && "Envelope voided"}
                      {isDeclined && "Signing declined"}
                      {isExpired && "Envelope expired"}
                    </h3>
                    <p className="text-sm text-text-muted mt-1">
                      {envelope.voidedReason ??
                        envelope.declinedReason ??
                        "This envelope is no longer active."}
                    </p>
                    <Link
                      href={`/deals/${dealId}/signatures`}
                      className="mt-4 inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent text-bg-primary text-sm font-medium hover:bg-[#d4e639]"
                    >
                      Back to envelopes
                    </Link>
                  </div>
                </div>
              )}

              {!isTerminal && iframeUrl && (
                <iframe
                  src={iframeUrl}
                  title="DocuSign signing"
                  className="w-full h-[640px] bg-bg-primary"
                  allow="camera; microphone"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              )}

              {!isTerminal && !iframeUrl && !error && (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div className="text-sm text-text-muted inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Preparing signing session…
                  </div>
                </div>
              )}
            </div>

            <aside className="p-4">
              <h4 className="text-sm font-semibold text-text-primary mb-2">Signers</h4>
              <SignerList signers={envelope.signers} />
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-text-muted">
                  Polling every 10 seconds. The status updates automatically
                  when DocuSign reports a state change.
                </p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="mt-2 text-xs h-8 px-3 rounded-md border border-border text-text-muted hover:text-text-primary"
                >
                  Refresh now
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
