import { Suspense } from "react";
import { PageHeader } from "@/components/layout";
import { PurchaseListView } from "@/components/purchases/PurchaseListView";

export const metadata = {
  title: "Purchase from Public · DealerOS",
  description: "Track vehicles purchased from the public — walk-ins, phone leads, online listings, and auctions.",
};

/**
 * Purchase from Public — Module 2.4 of the AdaptUs DMS spec.
 *
 * Server component shell. The interactive list lives in
 * `<PurchaseListView />` to keep the page route tree-shakable.
 */
export default function PurchaseFromPublicPage() {
  return (
    <>
      <PageHeader
        title="Purchase from Public"
        description="Track every vehicle you buy from the public — walk-ins, phone, online, and auctions."
      />
      <Suspense fallback={null}>
        <PurchaseListView />
      </Suspense>
    </>
  );
}
