"use client";

/**
 * DuplicatesView — list + filter + per-pair merge flow for the
 * `/customers/duplicates` page.
 *
 * Data flow:
 *   - useDuplicateList()        — GET /customers/duplicates?status=...
 *   - useDismissDuplicate()     — POST /customers/:id/dismiss-duplicate/:otherId
 *   - useMergeCustomers()       — POST /customers/merge
 *   - DuplicateCompare modal    — opened when user clicks "Compare & merge"
 *
 * Filters:
 *   - status: pending | merged | dismissed
 *   - classification: auto_merge | flag | not_duplicate
 *
 * Each row shows the two customers side-by-side, the score, the top
 * reasons, and a button group: Compare & merge | Dismiss.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  GitMerge,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
  Mail,
  Phone,
  Copy,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { DuplicateCompare } from "@/components/customers/DuplicateCompare";
import { DuplicateBadge } from "@/components/customers/DuplicateBadge";
import { useDismissDuplicate, useMergeCustomers, useDuplicateList, type DuplicateListItem, type DuplicateListFilters } from "@/hooks/useDuplicateDetection";
import { formatDistanceToNow, formatPhone } from "@/lib/utils";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: Array<{ value: "pending" | "merged" | "dismissed" | "all"; label: string }> = [
  { value: "pending", label: "Pending review" },
  { value: "merged", label: "Merged" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

const CLASSIFICATION_OPTIONS: Array<{ value: "auto_merge" | "flag" | "not_duplicate" | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "auto_merge", label: "Auto-merge" },
  { value: "flag", label: "Needs review" },
];

export function DuplicatesView() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "merged" | "dismissed" | "all">("pending");
  const [classFilter, setClassFilter] = useState<"auto_merge" | "flag" | "not_duplicate" | "all">("all");
  const [activePair, setActivePair] = useState<DuplicateListItem | null>(null);

  const filters = useMemo<DuplicateListFilters>(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      classification: classFilter === "all" ? undefined : classFilter,
      limit: 100,
    }),
    [statusFilter, classFilter],
  );

  const { data, isLoading, isError, error, refetch } = useDuplicateList(filters);
  const dismiss = useDismissDuplicate();
  const merge = useMergeCustomers();

  const items = data ?? [];
  const summary = useMemo(() => {
    let auto = 0;
    let flag = 0;
    for (const it of items) {
      if (it.classification === "auto_merge") auto++;
      if (it.classification === "flag") flag++;
    }
    return { auto, flag };
  }, [items]);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          label="Auto-merge candidates"
          value={summary.auto}
          icon={<Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />}
          tone="accent"
        />
        <SummaryCard
          label="Needs review"
          value={summary.flag}
          icon={<AlertCircle className="h-4 w-4 text-warning" aria-hidden="true" />}
          tone="warning"
        />
        <SummaryCard
          label="Showing"
          value={items.length}
          icon={<Copy className="h-4 w-4 text-text-muted" aria-hidden="true" />}
          tone="muted"
          suffix={`of up to ${filters.limit ?? 100}`}
        />
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Status filter">
              {STATUS_OPTIONS.map((opt) => {
                const active = statusFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatusFilter(opt.value)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center h-8 px-3 rounded-full text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      active
                        ? "bg-accent text-bg-primary border-accent"
                        : "bg-bg-card text-text-muted border-border hover:border-border-active hover:text-text-primary",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Classification filter">
              {CLASSIFICATION_OPTIONS.map((opt) => {
                const active = classFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setClassFilter(opt.value)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center h-8 px-3 rounded-full text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      active
                        ? "bg-bg-elevated text-text-primary border-border-active"
                        : "bg-bg-card text-text-muted border-border hover:border-border-active hover:text-text-primary",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {isError ? (
        <ErrorState error={error as Error | null} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          status={statusFilter}
          onClearFilters={() => {
            setStatusFilter("pending");
            setClassFilter("all");
          }}
        />
      ) : (
        <ul className="space-y-2" role="list" aria-label="Duplicate customer pairs">
          {items.map((pair) => (
            <li key={pair.id}>
              <PairRow
                pair={pair}
                onCompare={() => setActivePair(pair)}
                onDismiss={async () => {
                  if (!pair.entityA || !pair.entityB) return;
                  await dismiss.mutateAsync({
                    customerId: pair.entityA.id,
                    otherId: pair.entityB.id,
                  });
                }}
                isDismissing={
                  dismiss.isPending && dismiss.variables?.customerId === pair.entityA?.id
                }
              />
            </li>
          ))}
        </ul>
      )}

      <DuplicateCompare
        isOpen={activePair !== null}
        onClose={() => setActivePair(null)}
        masterId={activePair?.entityA?.id ?? null}
        duplicateId={activePair?.entityB?.id ?? null}
        recordA={activePair?.entityA ?? null}
        recordB={activePair?.entityB ?? null}
        reasons={activePair?.reasons ?? []}
        score={activePair?.score}
        onMerged={() => {
          void refetch();
        }}
      />
    </div>
  );
}

/* ============================================================ */
/* Row                                                           */
/* ============================================================ */

function PairRow({
  pair,
  onCompare,
  onDismiss,
  isDismissing,
}: {
  pair: DuplicateListItem;
  onCompare: () => void;
  onDismiss: () => Promise<void> | void;
  isDismissing?: boolean;
}) {
  const isPending = pair.status === "pending";
  const a = pair.entityA;
  const b = pair.entityB;

  return (
    <Card variant="hover" className="p-0">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <DuplicateBadge
              kind={pair.classification === "auto_merge" ? "auto_merge" : "flag"}
              reasons={pair.reasons}
              score={pair.score}
              staticOnly
            />
            {pair.status !== "pending" && (
              <Badge
                variant={
                  pair.status === "merged"
                    ? "success"
                    : pair.status === "dismissed"
                      ? "muted"
                      : "info"
                }
              >
                {pair.status}
              </Badge>
            )}
            <span className="text-xs text-text-muted">
              {formatDistanceToNow(pair.createdAt)}
            </span>
          </div>
          {isPending && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={onCompare}
                aria-label="Compare and merge"
              >
                <GitMerge className="h-4 w-4" /> Compare & merge
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onDismiss()}
                disabled={isDismissing}
                isLoading={isDismissing}
                aria-label="Dismiss duplicate"
              >
                {isDismissing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                <Trash2 className="h-4 w-4" /> Dismiss
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-2">
          <CustomerSummary customer={a} />
          <div className="flex items-center justify-center text-text-muted" aria-hidden="true">
            <ArrowRight className="h-4 w-4" />
          </div>
          <CustomerSummary customer={b} />
        </div>
      </div>
    </Card>
  );
}

function CustomerSummary({ customer }: { customer: DuplicateListItem["entityA"] }) {
  if (!customer) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3 text-sm text-text-muted">
        Record not available
      </div>
    );
  }
  const initials = `${customer.firstName?.[0] ?? ""}${customer.lastName?.[0] ?? ""}`.toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3 min-h-[64px]">
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center text-bg-primary font-semibold flex-shrink-0"
        style={{ backgroundColor: "#E8FF47" }}
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/customers/${customer.id}`}
          className="text-sm font-semibold text-text-primary hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded truncate block"
        >
          {customer.firstName} {customer.lastName}
        </Link>
        <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5 flex-wrap">
          {customer.email && (
            <span className="inline-flex items-center gap-1 truncate">
              <Mail className="h-3 w-3" aria-hidden="true" />
              <span className="truncate max-w-[160px]">{customer.email}</span>
            </span>
          )}
          {customer.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" aria-hidden="true" />
              {formatPhone(customer.phone)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Sub-components                                                */
/* ============================================================ */

function SummaryCard({
  label,
  value,
  icon,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "accent" | "warning" | "muted";
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 flex items-center gap-3">
        <div
          className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
            tone === "accent" && "bg-accent/15 text-accent",
            tone === "warning" && "bg-warning/15 text-warning",
            tone === "muted" && "bg-bg-elevated text-text-muted",
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-text-muted">{label}</p>
          <p className="text-2xl font-bold text-text-primary tabular-nums">
            {value}
            {suffix && (
              <span className="text-xs text-text-muted font-normal ml-1">{suffix}</span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <ul className="space-y-2" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="p-4 bg-bg-card border border-border rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton variant="text" width={120} height={20} />
            <Skeleton variant="text" width={60} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2">
            <Skeleton height={64} />
            <Skeleton width={20} height={20} />
            <Skeleton height={64} />
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
      <p className="text-sm text-text-primary">Couldn't load duplicates.</p>
      <p className="text-xs text-text-muted">{error?.message ?? "Unknown error"}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" /> Retry
      </Button>
    </div>
  );
}

function EmptyState({
  status,
  onClearFilters,
}: {
  status: "pending" | "merged" | "dismissed" | "all";
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-12 bg-bg-card border border-border rounded-xl text-center">
      <Copy className="h-8 w-8 text-text-muted" aria-hidden="true" />
      <p className="text-sm text-text-primary">
        {status === "pending"
          ? "No pending duplicates. Nice work."
          : "No duplicates match these filters."}
      </p>
      <p className="text-xs text-text-muted">
        The detector scans every new customer + lead. Check back after the next ingest.
      </p>
      {status !== "pending" && (
        <Button variant="secondary" size="sm" onClick={onClearFilters} className="mt-2">
          <RefreshCw className="h-4 w-4" /> Reset filters
        </Button>
      )}
    </div>
  );
}
