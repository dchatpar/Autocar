"use client";

/**
 * Client island for /billing/checkout-success.
 *
 * Polls /api/billing/subscription a few times to confirm the webhook
 * has provisioned the subscription. Shows a small "Confirming your
 * plan…" status. If the user lands here without a session, we
 * surface a sign-in CTA.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSubscription } from "@/hooks/useBilling";
import { Skeleton } from "@/components/ui/Skeleton";

export function CheckoutSuccessClient() {
  const params = useSearchParams();
  const plan = params.get("plan");
  const [showDelayHint, setShowDelayHint] = useState(false);

  // Poll briefly to confirm the webhook has propagated. We use the
  // existing query with a short refetch interval.
  const subQ = useSubscription({
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setShowDelayHint(true), 8_000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="mb-6 space-y-2">
      {subQ.isError ? (
        <p className="text-sm text-warning">
          We couldn't confirm your subscription just yet. You can still head to
          the dashboard — your plan will appear within a minute.
        </p>
      ) : subQ.data ? (
        <p className="text-sm text-text-primary">
          ✓ Plan <span className="font-semibold">{subQ.data.plan}</span> is
          active.
        </p>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
          <Skeleton className="h-3 w-3 rounded-full" />
          <span>Confirming your plan{plan ? ` (${plan})` : ""}…</span>
        </div>
      )}
      {showDelayHint && !subQ.data && (
        <p className="text-xs text-text-muted">
          Still loading?{" "}
          <Link href="/support" className="text-accent hover:underline">
            Contact support
          </Link>
          .
        </p>
      )}
    </div>
  );
}
