"use client";

/**
 * PurchaseListView — list of vehicle purchases (AdaptUs DMS Module 2.4).
 *
 * Filterable by status + source, search by VIN/make/model/seller.
 * Row click navigates to detail (Phase 2). For now, only "Add" is wired.
 */

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Car,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  Search,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { useVehiclePurchases } from "@/hooks/useVehiclePurchases";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { PurchaseStatus } from "@dealeros/shared";

const STATUS_OPTIONS: Array<{ value: PurchaseStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING", label: "Pending" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "WALKIN", label: "Walk-in" },
  { value: "PHONE", label: "Phone" },
  { value: "ONLINE", label: "Online" },
  { value: "AUCTION", label: "Auction" },
  { value: "TRADE_IN", label: "Trade-in" },
  { value: "OTHER", label: "Other" },
];

const STATUS_VARIANT: Record<PurchaseStatus, "info" | "warning" | "success" | "muted" | "danger"> = {
  DRAFT: "muted",
  PENDING: "warning",
  COMPLETED: "success",
  CANCELLED: "danger",
};

const STATUS_LABEL: Record<PurchaseStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const SOURCE_LABEL: Record<string, string> = {
  WALKIN: "Walk-in",
  PHONE: "Phone",
  ONLINE: "Online",
  AUCTION: "Auction",
  TRADE_IN: "Trade-in",
  OTHER: "Other",
};

const CONDITION_VARIANT = {
  EXCELLENT: "success",
  GOOD: "info",
  FAIR: "warning",
  POOR: "danger",
  SALVAGE: "danger",
} as const;

export function PurchaseListView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = (searchParams.get("status") ?? "all") as PurchaseStatus | "all";
  const source = searchParams.get("source") ?? "all";
  const q = searchParams.get("q") ?? "";

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const filters = useMemo(
    () => ({ status, source: source === "all" ? undefined : source, search: q }),
    [status, source, q]
  );

  const { data, isLoading, isError, error, refetch } = useVehiclePurchases(filters);

  const stats = useMemo(() => {
    if (!data) return { total: 0, month: 0, invested: 0, completed: 0 };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      total: data.length,
      month: data.filter((p) => p.purchaseDate >= monthStart).length,
      invested: data
        .filter((p) => p.status !== "CANCELLED")
        .reduce((sum, p) => sum + p.purchasePrice, 0),
      completed: data.filter((p) => p.status === "COMPLETED").length,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total purchases" value={stats.total} />
        <StatCard label="This month" value={stats.month} tone="accent" />
        <StatCard
          label="Capital invested"
          value={formatCurrency(stats.invested)}
          tone="info"
        />
        <StatCard label="Completed" value={stats.completed} tone="success" />
      </div>

      {/* Filters + Add */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1 max-w-3xl">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by VIN, make, model, seller…"
              value={q}
              onChange={(e) => setParam("q", e.target.value)}
              leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              aria-label="Search purchases"
            />
          </div>
          <div className="w-40">
            <Select
              options={STATUS_OPTIONS}
              value={status}
              onChange={(v) => setParam("status", v)}
              aria-label="Filter by status"
            />
          </div>
          <div className="w-40">
            <Select
              options={SOURCE_OPTIONS}
              value={source}
              onChange={(v) => setParam("source", v)}
              aria-label="Filter by source"
            />
          </div>
        </div>
        <Link
          href="/purchase-from-public/new"
          className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-accent text-bg-primary font-medium text-sm hover:bg-[#d4e639] active:scale-[0.98] transition-all shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Record purchase</span>
        </Link>
      </div>

      {/* Content */}
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : data && data.length === 0 ? (
        <EmptyState
          icon={<Car className="h-6 w-6" aria-hidden="true" />}
          title="No purchases recorded"
          description="Track every vehicle you buy from the public — walk-ins, calls, online leads, and auctions."
          primaryAction={{
            label: "Record first purchase",
            href: "/purchase-from-public/new",
            icon: <Plus className="h-4 w-4" aria-hidden="true" />,
          }}
          tone="accent"
        />
      ) : (
        <ul className="space-y-2" role="list" aria-label="Purchase list">
          {data?.map((p) => {
            return (
              <li key={p.id}>
                <Link
                  href={`/purchase-from-public/${p.id}`}
                  className="group flex items-center gap-4 p-4 bg-bg-card border border-border rounded-xl hover:border-border-active transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-h-[72px]"
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-bg-primary font-semibold flex-shrink-0 bg-accent/15 text-accent"
                    aria-hidden="true"
                  >
                    <Car className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-semibold text-text-primary">
                        {p.year} {p.make} {p.model}
                        {p.trim ? ` ${p.trim}` : ""}
                      </p>
                      <Badge variant={STATUS_VARIANT[p.status]}>
                        {STATUS_LABEL[p.status]}
                      </Badge>
                      <Badge variant={CONDITION_VARIANT[p.condition]}>
                        {p.condition}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
                      <span className="inline-flex items-center gap-1 font-mono">
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        {p.vin}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" aria-hidden="true" />
                        {p.sellerName}
                      </span>
                      <span>· {SOURCE_LABEL[p.source] ?? p.source}</span>
                      <span>· {p.odometer.toLocaleString()} km</span>
                    </div>
                  </div>

                  <div className="hidden md:flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-sm font-semibold text-text-primary tabular-nums">
                      {formatCurrency(p.purchasePrice)}
                    </span>
                    <span className="text-xs text-text-muted">
                      {formatDate(p.purchaseDate)}
                    </span>
                  </div>

                  <ChevronRight
                    className="h-4 w-4 text-text-muted group-hover:text-accent transition-colors flex-shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {!isLoading && !isError && data && (
        <p className="text-xs text-text-muted text-center" aria-live="polite">
          {data.length} purchase{data.length === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "info" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 bg-bg-card",
        tone === "default" && "border-border",
        tone === "accent" && "border-accent/20",
        tone === "info" && "border-info/20",
        tone === "success" && "border-success/20"
      )}
    >
      <p className="text-xs text-text-muted">{label}</p>
      <p
        className={cn(
          "text-xl font-bold mt-0.5 tabular-nums",
          tone === "default" && "text-text-primary",
          tone === "accent" && "text-accent",
          tone === "info" && "text-info",
          tone === "success" && "text-success"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <ul className="space-y-2" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="p-4 bg-bg-card border border-border rounded-xl">
          <div className="flex items-center gap-4">
            <Skeleton variant="rectangular" width={40} height={40} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="65%" />
            </div>
            <Skeleton variant="text" width={80} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 flex flex-col items-center text-center gap-2">
      <AlertCircle className="h-6 w-6 text-danger" aria-hidden="true" />
      <p className="text-sm font-medium text-text-primary">Failed to load purchases</p>
      <p className="text-xs text-text-muted">{error.message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}
