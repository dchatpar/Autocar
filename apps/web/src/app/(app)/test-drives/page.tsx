import Link from "next/link";
import { Calendar, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/common/EmptyState";

export const metadata = {
  title: "Test Drives · DealerOS",
  description: "Schedule and track test drives.",
};

export default function TestDrivesPage() {
  return (
    <>
      <PageHeader
        title="Test Drives"
        description="Schedule and track every test drive — before, during, and after."
        actions={
          <Link
            href="/test-drives/new"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-accent text-bg-primary font-medium text-sm hover:bg-accent/90 active:scale-[0.98] transition-all shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Schedule test drive</span>
          </Link>
        }
      />
      <EmptyState
        icon={<Calendar className="h-6 w-6" aria-hidden="true" />}
        title="Calendar view coming soon"
        description="Test drive calendar and stats land in Phase 2. For now, jump straight into scheduling."
        primaryAction={{
          label: "Schedule a test drive",
          href: "/test-drives/new",
          icon: <Plus className="h-4 w-4" aria-hidden="true" />,
        }}
        tone="accent"
      />
    </>
  );
}
