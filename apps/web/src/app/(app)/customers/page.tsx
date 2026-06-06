import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { CustomerListView } from "@/components/customers/CustomerListView";
import { Skeleton } from "@/components/ui/Skeleton";

function CustomerListLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Search and filter bar skeleton */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="h-10 w-64 bg-bg-elevated rounded-lg animate-pulse" />
        <div className="h-10 w-40 bg-bg-elevated rounded-lg animate-pulse" />
        <div className="h-10 w-40 bg-bg-elevated rounded-lg animate-pulse" />
      </div>
      {/* Table header */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="bg-bg-elevated px-4 py-3 flex gap-4">
          <div className="h-4 w-32 bg-bg-card rounded animate-pulse" />
          <div className="h-4 w-24 bg-bg-card rounded animate-pulse" />
          <div className="h-4 w-32 bg-bg-card rounded animate-pulse" />
          <div className="h-4 w-24 bg-bg-card rounded animate-pulse" />
          <div className="h-4 w-20 bg-bg-card rounded animate-pulse ml-auto" />
        </div>
        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-t border-border flex gap-4 items-center">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        ))}
      </div>
      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export default function CustomersPage() {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Search and filter your customer base by credit tier."
        actions={
          <Link
            href="/customers/new"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-accent text-bg-primary font-medium text-sm hover:bg-accent/90 active:scale-[0.98] transition-all shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add customer</span>
          </Link>
        }
      />
      <Suspense fallback={<CustomerListLoadingSkeleton />}>
        <CustomerListView />
      </Suspense>
    </>
  );
}
