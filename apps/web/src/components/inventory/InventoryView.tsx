"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { LayoutGrid, List, Plus, AlertCircle, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleGrid } from "./VehicleGrid";
import { VehicleTable } from "./VehicleTable";
import { VinDecoderModal } from "./VinDecoderModal";
import { useInventory } from "@/hooks/useInventory";
import { MOCK_VEHICLES } from "@/lib/mock-data";
import type { VehicleStatus } from "@/types/api";

type ViewMode = "grid" | "list";

const STATUS_OPTIONS: Array<{ value: VehicleStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "pending", label: "Pending" },
  { value: "sold", label: "Sold" },
  { value: "in_service", label: "In service" },
  { value: "wholesale", label: "Wholesale" },
];

const PRICE_BUCKETS: Array<{ value: string; label: string; min?: number; max?: number }> = [
  { value: "all", label: "Any price" },
  { value: "0-20000", label: "Under $20k", max: 20000 },
  { value: "20000-35000", label: "$20k – $35k", min: 20000, max: 35000 },
  { value: "35000-50000", label: "$35k – $50k", min: 35000, max: 50000 },
  { value: "50000-", label: "$50k+", min: 50000 },
];

export function InventoryView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [view, setView] = useState<ViewMode>("grid");
  const [vinOpen, setVinOpen] = useState(false);

  const status = (searchParams.get("status") ?? "all") as VehicleStatus | "all";
  const make = searchParams.get("make") ?? "all";
  const priceBucket = searchParams.get("price") ?? "all";
  const q = searchParams.get("q") ?? "";

  const bucket = PRICE_BUCKETS.find((b) => b.value === priceBucket) ?? PRICE_BUCKETS[0];

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const filters = useMemo(
    () => ({
      status,
      make,
      minPrice: bucket.min,
      maxPrice: bucket.max,
      search: q,
    }),
    [status, make, bucket.min, bucket.max, q],
  );

  const { data: vehicles, isLoading, isError, error, refetch } = useInventory(filters);

  const makes = useMemo(
    () => Array.from(new Set(MOCK_VEHICLES.map((v) => v.make))).sort(),
    [],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-sm relative">
            <Input
              placeholder="Search by VIN, make, model…"
              value={q}
              onChange={(e) => setParam("q", e.target.value)}
              leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              aria-label="Search inventory"
            />
          </div>
          <div className="w-36">
            <Select
              options={STATUS_OPTIONS}
              value={status}
              onChange={(v) => setParam("status", v)}
              aria-label="Filter by status"
            />
          </div>
          <div className="w-36">
            <Select
              options={[
                { value: "all", label: "All makes" },
                ...makes.map((m) => ({ value: m, label: m })),
              ]}
              value={make}
              onChange={(v) => setParam("make", v)}
              aria-label="Filter by make"
            />
          </div>
          <div className="w-40">
            <Select
              options={PRICE_BUCKETS.map((b) => ({ value: b.value, label: b.label }))}
              value={priceBucket}
              onChange={(v) => setParam("price", v)}
              aria-label="Filter by price"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="View mode"
            className="inline-flex rounded-lg border border-border bg-bg-card p-0.5"
          >
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-pressed={view === "grid"}
              className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium transition-colors ${
                view === "grid" ? "bg-accent text-bg-primary" : "text-text-muted hover:text-text-primary"
              }`}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium transition-colors ${
                view === "list" ? "bg-accent text-bg-primary" : "text-text-muted hover:text-text-primary"
              }`}
            >
              <List className="h-4 w-4" aria-hidden="true" />
              <span>List</span>
            </button>
          </div>
          <Button variant="primary" onClick={() => setVinOpen(true)}>
            <Plus className="h-4 w-4" />
            Add vehicle
          </Button>
        </div>
      </div>

      {/* Content */}
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState view={view} />
      ) : view === "grid" ? (
        <VehicleGrid vehicles={vehicles ?? []} />
      ) : (
        <VehicleTable vehicles={vehicles ?? []} />
      )}

      {/* Result count */}
      {!isLoading && !isError && (
        <p className="text-xs text-text-muted text-center" aria-live="polite">
          {vehicles?.length ?? 0} vehicle{(vehicles?.length ?? 0) === 1 ? "" : "s"}
        </p>
      )}

      <VinDecoderModal isOpen={vinOpen} onClose={() => setVinOpen(false)} />
    </div>
  );
}

function LoadingState({ view }: { view: ViewMode }) {
  if (view === "grid") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-busy="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-bg-card border border-border rounded-xl overflow-hidden">
            <Skeleton height={180} className="rounded-none" />
            <div className="p-3 space-y-2">
              <Skeleton variant="text" width="70%" />
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="60%" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} height={48} />
      ))}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 bg-bg-card border border-border rounded-xl">
      <AlertCircle className="h-8 w-8 text-danger" aria-hidden="true" />
      <p className="text-sm text-text-primary">Couldn't load inventory.</p>
      <p className="text-xs text-text-muted">{error?.message ?? "Unknown error"}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" /> Retry
      </Button>
    </div>
  );
}
