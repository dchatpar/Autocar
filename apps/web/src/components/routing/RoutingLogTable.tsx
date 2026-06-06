"use client";

/**
 * RoutingLogTable — last 100 LeadRoutingLog rows.
 *
 * Skeleton on first load, empty state when none, error state on
 * network failure. Otherwise a table of: time, lead, strategy, rep,
 * reason, response time.
 */

import { useState } from "react";
import { AlertCircle, ChevronDown, Clock, ArrowDownUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useRoutingLog } from "@/hooks/useRoutingLog";
import { ROUTING_STRATEGY_LABEL, type RoutingLogRow } from "@/types/routing";
import { cn } from "@/lib/utils";

type SortKey = "routedAt" | "responseTimeMs" | "strategyUsed";

const STRATEGY_BADGE: Record<string, "info" | "success" | "accent" | "warning" | "muted"> = {
  ROUND_ROBIN: "info",
  LOAD_BALANCED: "success",
  SOURCE_BASED: "accent",
  GEOGRAPHIC: "warning",
  VEHICLE_MATCH: "info",
  AI_SCORED: "accent",
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

export function RoutingLogTable() {
  const [sort, setSort] = useState<SortKey>("routedAt");
  const [filter, setFilter] = useState<string>("all");
  const { data, isLoading, isError, refetch, isFetching } = useRoutingLog(100);

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={48} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-sm text-danger" role="alert">
        <AlertCircle className="h-5 w-5" />
        <p>Couldn't load the routing log.</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-text-muted text-center py-8">
        No routing decisions yet. Connect Meta Lead Ads to start seeing live activity.
      </div>
    );
  }

  const filtered =
    filter === "all" ? data : data.filter((r) => r.strategyUsed === filter);
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "routedAt") {
      return new Date(b.routedAt).getTime() - new Date(a.routedAt).getTime();
    }
    if (sort === "responseTimeMs") return b.responseTimeMs - a.responseTimeMs;
    return a.strategyUsed.localeCompare(b.strategyUsed);
  });

  const strategies = Array.from(new Set(data.map((r) => r.strategyUsed)));

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Select
            options={[
              { value: "all", label: "All strategies" },
              ...strategies.map((s) => ({
                value: s,
                label: ROUTING_STRATEGY_LABEL[s as keyof typeof ROUTING_STRATEGY_LABEL] ?? s,
              })),
            ]}
            value={filter}
            onChange={setFilter}
            aria-label="Filter by strategy"
          />
          <Select
            options={[
              { value: "routedAt", label: "Newest first" },
              { value: "responseTimeMs", label: "Slowest first" },
              { value: "strategyUsed", label: "By strategy" },
            ]}
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            aria-label="Sort"
          />
        </div>
        <span className="text-xs text-text-muted" aria-live="polite">
          {sorted.length} decision{sorted.length === 1 ? "" : "s"}
          {isFetching && " · refreshing…"}
        </span>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Lead</th>
              <th className="px-3 py-2 font-medium">Strategy</th>
              <th className="px-3 py-2 font-medium">Rep</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium text-right">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> RT
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <RoutingLogRowView key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoutingLogRowView({ row }: { row: RoutingLogRow }) {
  const variant = STRATEGY_BADGE[row.strategyUsed] ?? "muted";
  return (
    <tr className="border-t border-border hover:bg-bg-elevated/50">
      <td className="px-3 py-2 text-text-muted whitespace-nowrap">
        {formatRelative(row.routedAt)}
      </td>
      <td className="px-3 py-2 text-text-primary max-w-[180px] truncate">
        {row.leadName ?? row.leadId}
      </td>
      <td className="px-3 py-2">
        <Badge variant={variant}>
          {ROUTING_STRATEGY_LABEL[row.strategyUsed as keyof typeof ROUTING_STRATEGY_LABEL] ??
            row.strategyUsed}
        </Badge>
      </td>
      <td className="px-3 py-2">
        {row.selectedRepId ? (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={row.selectedRepName ?? "?"} size="sm" />
            <span className="truncate">{row.selectedRepName ?? "Unknown"}</span>
          </div>
        ) : (
          <span className="text-text-muted text-xs">— unassigned —</span>
        )}
      </td>
      <td className="px-3 py-2 text-text-muted max-w-[300px]">
        <p className="truncate" title={row.reason}>
          {row.reason}
        </p>
      </td>
      <td className={cn("px-3 py-2 text-right font-mono text-xs", row.responseTimeMs > 50 ? "text-warning" : "text-text-muted")}>
        {row.responseTimeMs}ms
      </td>
    </tr>
  );
}

void ArrowDownUp;
void ChevronDown;
