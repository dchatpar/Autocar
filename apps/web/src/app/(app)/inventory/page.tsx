import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { InventoryView } from "@/components/inventory/InventoryView";
import { VehicleCardSkeleton, Skeleton } from "@/components/ui/Skeleton";

function InventoryLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Filter bar skeleton */}
      <div className="flex flex-wrap gap-2">
        <div className="h-10 w-64 bg-bg-elevated rounded-lg animate-pulse" />
        <div className="h-10 w-40 bg-bg-elevated rounded-lg animate-pulse" />
        <div className="h-10 w-40 bg-bg-elevated rounded-lg animate-pulse" />
        <div className="h-10 w-32 bg-bg-elevated rounded-lg animate-pulse" />
      </div>
      {/* View toggle skeleton */}
      <div className="flex items-center gap-4">
        <div className="h-9 w-32 bg-bg-elevated rounded-lg animate-pulse" />
        <div className="ml-auto flex gap-2">
          <div className="h-9 w-9 bg-bg-elevated rounded-lg animate-pulse" />
          <div className="h-9 w-9 bg-bg-elevated rounded-lg animate-pulse" />
        </div>
      </div>
      {/* Vehicle grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <VehicleCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

export default function InventoryPage() {
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Manage vehicles on the lot — search, filter, and add new units."
        actions={
          <Link
            href="/inventory/new"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-accent text-bg-primary font-medium text-sm hover:bg-accent/90 active:scale-[0.98] transition-all shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-bg-primary"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add vehicle</span>
          </Link>
        }
      />
      <Suspense fallback={<InventoryLoadingSkeleton />}>
        <InventoryView />
      </Suspense>
    </>
  );
}
