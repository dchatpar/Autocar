"use client";

import * as React from "react";

/**
 * ActivityTimeline — chronological view of audit log entries.
 *
 * Supports two layouts:
 *   - `feed` (default): a single-column vertical list with sticky
 *     day headers and a left-rail timeline rail.
 *   - `compact`: a denser table-style view used in entity side panels.
 *
 * Each row supports:
 *   - Click to expand → shows full row + DiffViewer.
 *   - Anomaly badge when `metadata.anomaly === true`.
 *   - User avatar (initials), action chip, entity link, timestamp.
 *   - Keyboard navigation: rows are focusable buttons, Enter / Space
 *     toggle the expanded state.
 *
 * Accessibility:
 *   - Each row has `aria-label` with the action summary.
 *   - `role="region"` on the container with an accessible name.
 *   - Focus rings via globals.css.
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnomalyBadge, AnomalyDot, StatusOK } from "./AnomalyBadge";
import { DiffViewer } from "./DiffViewer";
import { EmptyState } from "@/components/common/EmptyState";
import type {
  ActivityLogRecord,
  AnomalySeverity,
} from "@/hooks/useActivityLogs";

export interface ActivityTimelineProps {
  logs: ActivityLogRecord[];
  loading?: boolean;
  className?: string;
  layout?: "feed" | "compact";
  emptyMessage?: string;
  onEntityClick?: (entityType: string, entityId: string) => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function dayBucket(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function initialsOf(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
}

function humanizeAction(action: string): string {
  return action
    .split(".")
    .map((segment) =>
      segment
        .split("_")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" "),
    )
    .join(" · ");
}

function severityOfAnomaly(
  metadata: Record<string, unknown>,
): AnomalySeverity | null {
  if (metadata.anomaly !== true) return null;
  const reasons = Array.isArray(metadata.anomalyReasons)
    ? (metadata.anomalyReasons as Array<{ severity?: unknown }>)
    : [];
  let top: AnomalySeverity | null = null;
  let topRank = 0;
  for (const r of reasons) {
    if (r.severity === "high") return "high";
    if (r.severity === "medium" && topRank < 2) {
      top = "medium";
      topRank = 2;
    }
    if (r.severity === "low" && topRank < 1) {
      top = "low";
      topRank = 1;
    }
  }
  return top;
}

interface DayGroup {
  day: string;
  logs: ActivityLogRecord[];
}

export function ActivityTimeline({
  logs,
  loading,
  className,
  layout = "feed",
  emptyMessage = "No activity yet.",
  onEntityClick,
}: ActivityTimelineProps): React.ReactElement {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState<string>("");
  const [anomalyOnly, setAnomalyOnly] = useState<boolean>(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (anomalyOnly && l.metadata.anomaly !== true) return false;
      if (!q) return true;
      const hay = `${l.action} ${l.entityType} ${l.entityId ?? ""} ${l.userId ?? ""} ${l.ipAddress ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [logs, search, anomalyOnly]);

  const grouped: DayGroup[] = useMemo(() => {
    const map = new Map<string, ActivityLogRecord[]>();
    for (const l of filtered) {
      const k = dayBucket(l.createdAt);
      const arr = map.get(k) ?? [];
      arr.push(l);
      map.set(k, arr);
    }
    return Array.from(map.entries()).map(([day, logs]) => ({ day, logs }));
  }, [filtered]);

  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        className={cn("space-y-2", className)}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-md border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900"
          />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        title="No matching activity"
        description={emptyMessage}
        className={className}
      />
    );
  }

  return (
    <section
      role="region"
      aria-label="Activity timeline"
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter timeline…"
            aria-label="Filter activity timeline"
            className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-7 pr-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        </div>
        <button
          type="button"
          onClick={() => setAnomalyOnly((v) => !v)}
          aria-pressed={anomalyOnly}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium",
            anomalyOnly
              ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200",
          )}
        >
          <Filter className="h-3 w-3" aria-hidden="true" />
          Anomalies only
        </button>
      </div>

      <ol className="space-y-4" aria-label="Activity entries">
        {grouped.map((group) => (
          <li key={group.day} className="space-y-2">
            <h3 className="sticky top-0 z-10 bg-gray-50/80 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 backdrop-blur dark:bg-gray-900/80 dark:text-gray-400">
              {group.day}
            </h3>
            <ul className="space-y-2">
              {group.logs.map((log) => (
                <Row
                  key={log.id}
                  log={log}
                  expanded={expanded[log.id] === true}
                  layout={layout}
                  onToggle={() =>
                    setExpanded((prev) => ({ ...prev, [log.id]: !prev[log.id] }))
                  }
                  onEntityClick={onEntityClick}
                />
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface RowProps {
  log: ActivityLogRecord;
  expanded: boolean;
  layout: "feed" | "compact";
  onToggle: () => void;
  onEntityClick?: (entityType: string, entityId: string) => void;
}

function Row({
  log,
  expanded,
  layout,
  onToggle,
  onEntityClick,
}: RowProps): React.ReactElement {
  const severity = severityOfAnomaly(log.metadata);
  const Icon = expanded ? ChevronDown : ChevronRight;

  const ariaLabel = `${humanizeAction(log.action)} by ${
    log.userId ?? "system"
  } on ${new Date(log.createdAt).toLocaleString()}${
    severity ? `, anomaly severity ${severity}` : ""
  }`;

  if (layout === "compact") {
    return (
      <li>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={ariaLabel}
          className={cn(
            "flex w-full items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-left text-xs hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900",
          )}
        >
          {severity ? <AnomalyDot severity={severity} /> : <StatusOK />}
          <span className="font-mono text-gray-700 dark:text-gray-300">
            {humanizeAction(log.action)}
          </span>
          <span className="ml-auto text-gray-500 dark:text-gray-400">
            {formatTimestamp(log.createdAt)}
          </span>
        </button>
        {expanded ? (
          <div className="mt-2">
            <DiffViewer
              before={log.before}
              after={log.after}
              diff={log.diff}
              initialCollapsed={false}
            />
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <li>
      <article
        aria-label={ariaLabel}
        className={cn(
          "rounded-lg border border-gray-200 bg-white transition-shadow dark:border-gray-800 dark:bg-gray-950",
          expanded && "shadow-sm",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full items-center gap-3 px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Icon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <Avatar name={log.userId} />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                {humanizeAction(log.action)}
              </span>
              {log.entityType ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (log.entityId && onEntityClick) {
                      onEntityClick(log.entityType, log.entityId);
                    }
                  }}
                  disabled={!log.entityId || !onEntityClick}
                  className="truncate rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-60 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                  aria-label={`Open ${log.entityType} ${log.entityId ?? ""}`}
                >
                  {log.entityType}
                  {log.entityId ? `:${shortenId(log.entityId)}` : ""}
                </button>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{log.userId ?? "system"}</span>
              {log.ipAddress ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{log.ipAddress}</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span>{formatTimestamp(log.createdAt)}</span>
            </div>
          </div>
          {severity ? <AnomalyBadge severity={severity} reasons={getReasons(log.metadata)} /> : null}
        </button>

        {expanded ? (
          <div className="border-t border-gray-200 px-3 py-3 dark:border-gray-800">
            <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
              <div>
                <span className="font-semibold">ID:</span>{" "}
                <span className="font-mono">{log.id}</span>
              </div>
              <div>
                <span className="font-semibold">User agent:</span>{" "}
                <span className="line-clamp-2 break-all font-mono">
                  {log.userAgent ?? "—"}
                </span>
              </div>
            </div>
            {log.before || log.after ? (
              <DiffViewer
                before={log.before}
                after={log.after}
                diff={log.diff}
                initialCollapsed={false}
              />
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This event didn&apos;t carry before/after snapshots.
              </p>
            )}
            {log.metadata && Object.keys(log.metadata).length > 0 ? (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-gray-500 dark:text-gray-400">
                  Metadata ({Object.keys(log.metadata).length} fields)
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-md bg-gray-50 p-2 font-mono text-[11px] dark:bg-gray-900">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </article>
    </li>
  );
}

function getReasons(metadata: Record<string, unknown>): Array<{
  reason: string;
  severity: AnomalySeverity;
}> {
  if (!Array.isArray(metadata.anomalyReasons)) return [];
  return (metadata.anomalyReasons as Array<{ reason: string; severity: AnomalySeverity }>).filter(
    (r) => typeof r.reason === "string",
  );
}

function Avatar({ name }: { name: string | null }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-[10px] font-bold text-white"
    >
      {name ? initialsOf(name) : <UserIcon className="h-3 w-3" />}
    </span>
  );
}

function shortenId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-3)}`;
}
