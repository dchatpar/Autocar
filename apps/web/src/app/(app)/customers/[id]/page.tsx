import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout";
import { CustomerDetailView } from "@/components/customers/CustomerDetailView";
import { MOCK_CUSTOMERS } from "@/lib/mock-data";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Server component — resolves the customer id, then hands off to the client
 * detail view for live data + interactions.
 */
export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params;

  // Server-side existence check for proper 404.
  const exists = MOCK_CUSTOMERS.some((c) => c.id === id);
  if (!exists) notFound();

  return (
    <>
      <div className="mb-2 text-xs text-text-muted">
        <Link
          href="/customers"
          className="hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          ← Back to customers
        </Link>
      </div>
      <PageHeader title="Customer 360" description={`Customer #${id}`} />
      <CustomerDetailView customerId={id} />
    </>
  );
}
