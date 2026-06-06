import { Suspense } from "react";
import { PageHeader } from "@/components/layout";
import { DuplicatesView } from "@/components/customers/DuplicatesView";

export const metadata = {
  title: "Duplicates · Customers · DealerOS",
  description:
    "Review and merge possible duplicate customers detected by fuzzy matching.",
};

export default function CustomersDuplicatesPage() {
  return (
    <>
      <PageHeader
        title="Duplicate customers"
        description="Review and merge possible duplicate records detected by email, phone, and name matching."
      />
      <Suspense fallback={null}>
        <DuplicatesView />
      </Suspense>
    </>
  );
}
