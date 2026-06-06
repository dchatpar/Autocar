/**
 * Checkout success — /billing/checkout-success
 *
 * Shown after a successful Stripe Checkout redirect. The actual
 * subscription is provisioned asynchronously by the Stripe webhook,
 * so we render a "Setting up your account" state and gently bounce
 * the user to /settings/billing where the dashboard will reflect
 * the new subscription within a few seconds.
 */

import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { CheckoutSuccessClient } from "./CheckoutSuccessClient";

export const metadata = {
  title: "Welcome to DealerOS — Billing",
};

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/20 text-accent mb-6">
          <CheckCircle2 className="w-9 h-9" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          You're all set!
        </h1>
        <p className="text-text-muted mb-6">
          Your 14-day free trial is active. We're provisioning your subscription
          now — this usually takes a few seconds.
        </p>
        <Suspense fallback={null}>
          <CheckoutSuccessClient />
        </Suspense>
        <Link href="/settings/billing">
          <Button variant="primary" size="md" className="min-h-[44px]">
            Go to billing dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
