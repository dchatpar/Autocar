"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Search, AlertCircle, RefreshCw, ChevronRight, Mail, Phone, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCustomers } from "@/hooks/useCustomers";
import { formatCurrency, formatDate, formatPhone } from "@/lib/utils";
import type { CreditTier } from "@/types/api";

const TIER_OPTIONS: Array<{ value: CreditTier | "all"; label: string }> = [
  { value: "all", label: "All tiers" },
  { value: "A", label: "A (Prime)" },
  { value: "B", label: "B (Near-prime)" },
  { value: "C", label: "C (Standard)" },
  { value: "D", label: "D (Substandard)" },
  { value: "subprime", label: "Subprime" },
];

const TIER_VARIANT = {
  A: "success",
  B: "info",
  C: "warning",
  D: "muted",
  subprime: "danger",
} as const;

const TIER_LABELS: Record<CreditTier, string> = {
  A: "A · Prime",
  B: "B · Near-prime",
  C: "C · Standard",
  D: "D · Substandard",
  subprime: "Subprime",
};

export function CustomerListView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tier = (searchParams.get("tier") ?? "all") as CreditTier | "all";
  const q = searchParams.get("q") ?? "";

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const filters = useMemo(() => ({ tier, search: q }), [tier, q]);

  const { data: customers, isLoading, isError, error, refetch } = useCustomers(filters);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Search by name, email, phone…"
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
            leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
            aria-label="Search customers"
          />
        </div>
        <div className="w-48">
          <Select
            options={TIER_OPTIONS}
            value={tier}
            onChange={(v) => setParam("tier", v)}
            aria-label="Filter by credit tier"
          />
        </div>
      </div>

      {/* Tier quick-filter chips */}
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Quick tier filter">
        {TIER_OPTIONS.map((t) => {
          const active = tier === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setParam("tier", t.value)}
              aria-pressed={active}
              className={`inline-flex items-center h-8 px-3 rounded-full text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active
                  ? "bg-accent text-bg-primary border-accent"
                  : "bg-bg-card text-text-muted border-border hover:border-border-active hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : customers && customers.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-xl p-12 text-center">
          <p className="text-text-muted">No customers match your filters.</p>
        </div>
      ) : (
        <ul className="space-y-2" role="list" aria-label="Customer list">
          {customers?.map((c) => (
            <li key={c.id}>
              <Link
                href={`/customers/${c.id}`}
                className="group flex items-center gap-4 p-4 bg-bg-card border border-border rounded-xl hover:border-border-active transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-h-[64px]"
              >
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-bg-primary font-semibold flex-shrink-0"
                  style={{ backgroundColor: "#E8FF47" }}
                  aria-hidden="true"
                >
                  {c.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-semibold text-text-primary truncate">{c.name}</p>
                    <Badge variant={TIER_VARIANT[c.creditTier]}>{TIER_LABELS[c.creditTier]}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" aria-hidden="true" />
                      <span className="truncate max-w-[180px]">{c.email}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" aria-hidden="true" />
                      {formatPhone(c.phone)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {c.address.city}, {c.address.state}
                    </span>
                  </div>
                </div>

                <div className="hidden md:flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-sm font-semibold text-text-primary tabular-nums">
                    {formatCurrency(c.lifetimeValue)}
                  </span>
                  <span className="text-xs text-text-muted">LTV · {c.openDeals} open</span>
                </div>

                <div className="hidden lg:block flex-shrink-0 text-right">
                  <p className="text-xs text-text-muted">Last contact</p>
                  <p className="text-xs text-text-primary">{formatDate(c.lastContact)}</p>
                </div>

                <ChevronRight
                  className="h-4 w-4 text-text-muted group-hover:text-accent transition-colors flex-shrink-0"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !isError && customers && (
        <p className="text-xs text-text-muted text-center" aria-live="polite">
          {customers.length} customer{customers.length === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <ul className="space-y-2" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="p-4 bg-bg-card border border-border rounded-xl">
          <div className="flex items-center gap-4">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="60%" />
            </div>
            <Skeleton variant="text" width={80} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ErrorState({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 bg-bg-card border border-border rounded-xl">
      <AlertCircle className="h-8 w-8 text-danger" aria-hidden="true" />
      <p className="text-sm text-text-primary">Couldn't load customers.</p>
      <p className="text-xs text-text-muted">{error?.message ?? "Unknown error"}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" /> Retry
      </Button>
    </div>
  );
}
