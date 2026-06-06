/**
 * Billing dashboard — /settings/billing
 *
 * Server-component shell. The interactive bits live in
 * `<BillingDashboard />` so the page can server-render the page
 * header while the data layer is fully client-side.
 */

import { Suspense } from "react";
import { PageHeader } from "@/components/layout";
import { BillingDashboard } from "./BillingDashboard";

export const metadata = {
  title: "Billing — DealerOS",
  description: "Manage your subscription, payment method, and invoices.",
};

export default function BillingSettingsPage() {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Manage your subscription, payment method, and invoices."
      />
      <Suspense fallback={null}>
        <BillingDashboard />
      </Suspense>
    </>
  );
}
