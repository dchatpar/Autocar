import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/common/EmptyState";

export const metadata = {
  title: "Deals · DealerOS",
  description: "Create and manage deals on the pipeline.",
};

export default function DealsPage() {
  return (
    <>
      <PageHeader
        title="Deals"
        description="Create and manage deals on the pipeline."
        actions={
          <Link
            href="/deals/new"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-accent text-bg-primary font-medium text-sm hover:bg-accent/90 active:scale-[0.98] transition-all shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>New deal</span>
          </Link>
        }
      />
      <EmptyState
        icon={<FileText className="h-6 w-6" aria-hidden="true" />}
        title="Deal pipeline coming soon"
        description="The full deal pipeline UI lands in Phase 2. You can already start a new deal here."
        primaryAction={{
          label: "Create a deal",
          href: "/deals/new",
          icon: <Plus className="h-4 w-4" aria-hidden="true" />,
        }}
        tone="accent"
      />
    </>
  );
}
