/**
 * Checkout cancel — /billing/checkout-cancel
 *
 * Shown when a user clicks "back" in Stripe Checkout or the
 * checkout session is cancelled. Friendly copy + a path back to
 * pricing and to the dashboard.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export const metadata = {
  title: "Checkout cancelled — DealerOS",
};

export default function CheckoutCancelPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-bg-elevated text-text-muted mb-6">
          <XCircle className="w-9 h-9" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Checkout cancelled
        </h1>
        <p className="text-text-muted mb-6">
          No charges were made. You can pick a different plan or pick up where
          you left off.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/pricing">
            <Button variant="primary" size="md" className="min-h-[44px]">
              View pricing
            </Button>
          </Link>
          <Link href="/settings/billing">
            <Button variant="secondary" size="md" className="min-h-[44px]">
              Back to billing
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
