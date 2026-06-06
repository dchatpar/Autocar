import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout";
import { LeadDetailView } from "@/components/leads/LeadDetailView";
import { MOCK_LEADS } from "@/lib/mock-data";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Lead detail — server component resolves the id, then hands off to the
 * client `LeadDetailView` for the score chart, signals breakdown, and
 * recompute button.
 */
export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;

  const exists = MOCK_LEADS.some((l) => l.id === id);
  if (!exists) notFound();

  return (
    <>
      <div className="mb-2 text-xs text-text-muted">
        <Link
          href="/leads"
          className="hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          ← Back to leads
        </Link>
      </div>
      <PageHeader
        title="Lead Score"
        description="Rules-based 0–100 lead quality score with full breakdown and history."
      />
      <LeadDetailView leadId={id} />
    </>
  );
}
