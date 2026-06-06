import { Suspense } from "react";
import { PageHeader } from "@/components/layout";
import { LeadsView } from "@/components/leads/LeadsView";
import { KanbanColumnSkeleton } from "@/components/ui/Skeleton";

function LeadsLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Filter bar skeleton */}
      <div className="flex flex-wrap gap-2">
        <div className="h-9 w-48 bg-bg-elevated rounded-lg animate-pulse" />
        <div className="h-9 w-32 bg-bg-elevated rounded-lg animate-pulse" />
        <div className="h-9 w-32 bg-bg-elevated rounded-lg animate-pulse" />
        <div className="h-9 w-32 bg-bg-elevated rounded-lg animate-pulse" />
      </div>
      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KanbanColumnSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

/**
 * Lead pipeline — Kanban + Table view with filter bar.
 * Server component fetches initial filters from the URL; client component
 * handles drag-drop, view toggle, and live data.
 */
export default function LeadsPage() {
  return (
    <>
      <PageHeader
        title="Lead Pipeline"
        description="Drag leads between stages to update their status."
      />
      <Suspense fallback={<LeadsLoadingSkeleton />}>
        <LeadsView />
      </Suspense>
    </>
  );
}
