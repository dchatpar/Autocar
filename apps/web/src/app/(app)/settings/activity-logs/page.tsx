import * as React from "react";
"use client";

/**
 * Activity Logs & Audit Trail page (DMS Module 10.2).
 *
 * Layout:
 *   ┌─ Header: title + export button ────────────────┐
 *   ├─ Tabs: Timeline | Anomalies | Stats ──────────┤
 *   ├─ Filter bar (action, user, type, date range) ─┤
 *   └─ Body: ActivityTimeline / AnomalyList / StatsChart ┘
 *
 * All data flows through `useActivityLogs` / `useAnomalies` /
 * `useActivityStats`. The page is fully client-side because
 * the timeline is interactive (expand rows, paginate, filter).
 */

import { useMemo, useState } from "react";
import { Download, Loader2, RefreshCw, ShieldAlert, BarChart3, History } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { AnomalyBadge, AnomalyDot } from "@/components/activity/AnomalyBadge";
import { EmptyState } from "@/components/common/EmptyState";
import {
  useActivityLogs,
  useActivityStats,
  useAnomalies,
  useExportActivityLogs,
  type ActivityLogFilters,
} from "@/hooks/useActivityLogs";

const DEFAULT_RANGE_DAYS = 30;

function isoFromNow(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400_000).toISOString();
}

function isoFromNowEnd(): string {
  return new Date().toISOString();
}

export default function ActivityLogsPage(): React.ReactElement {
  const [actionInput, setActionInput] = useState<string>("");
  const [userIdInput, setUserIdInput] = useState<string>("");
  const [entityInput, setEntityInput] = useState<string>("");
  const [from, setFrom] = useState<string>(isoFromNow(DEFAULT_RANGE_DAYS).slice(0, 10));
  const [to, setTo] = useState<string>(isoFromNowEnd().slice(0, 10));
  const [, setFilters] = useState<ActivityLogFilters>({});

  const rangeFrom = useMemo(
    () => new Date(`${from}T00:00:00.000Z`).toISOString(),
    [from],
  );
  const rangeTo = useMemo(
    () => new Date(`${to}T23:59:59.999Z`).toISOString(),
    [to],
  );

  const listQuery = useActivityLogs(
    {
      ...(actionInput ? { action: actionInput } : {}),
      ...(userIdInput ? { userId: userIdInput } : {}),
      ...(entityInput ? { entityType: entityInput } : {}),
      from: rangeFrom,
      to: rangeTo,
    },
    { refetchOnWindowFocus: false },
  );

  const anomaliesQuery = useAnomalies(rangeFrom, rangeTo, {
    refetchOnWindowFocus: false,
  });

  const statsQuery = useActivityStats(rangeFrom, rangeTo, {
    refetchOnWindowFocus: false,
  });

  const exportMutation = useExportActivityLogs({
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `activity-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });

  const onExport = (): void => {
    exportMutation.mutate({
      from: rangeFrom,
      to: rangeTo,
      format: "csv",
      anomalyOnly: false,
      includeSnapshots: false,
    });
  };

  const onRefresh = (): void => {
    void listQuery.refetch();
    void anomaliesQuery.refetch();
    void statsQuery.refetch();
  };

  const clearFilters = (): void => {
    setActionInput("");
    setUserIdInput("");
    setEntityInput("");
    setFilters({});
    setFrom(isoFromNow(DEFAULT_RANGE_DAYS).slice(0, 10));
    setTo(isoFromNowEnd().slice(0, 10));
  };

  return (
    <PageContainer>
      <PageHeader
        title="Activity Logs & Audit Trail"
        description="Every user action and system event across your dealership, with anomaly detection."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={onRefresh}
              disabled={listQuery.isFetching}
              aria-label="Refresh activity"
            >
              {listQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="ml-1.5">Refresh</span>
            </Button>
            <Button
              variant="primary"
              onClick={onExport}
              disabled={exportMutation.isPending}
              aria-label="Export activity log"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="ml-1.5">Export</span>
            </Button>
          </div>
        }
      />

      <Tabs
        tabs={[
          {
            id: "timeline",
            label: (
              <span>
                <History className="mr-1 inline h-4 w-4" aria-hidden="true" />
                Timeline
              </span>
            ),
            content: (
              <>
                <FilterBar
                  actionInput={actionInput}
                  userIdInput={userIdInput}
                  entityInput={entityInput}
                  from={from}
                  to={to}
                  onActionChange={setActionInput}
                  onUserIdChange={setUserIdInput}
                  onEntityChange={setEntityInput}
                  onFromChange={setFrom}
                  onToChange={setTo}
                  onClear={clearFilters}
                />
                <Card className="mt-4">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                    <CardTitle>Activity timeline</CardTitle>
                    <CardDescription>
                      {listQuery.data
                        ? `${listQuery.data.data.length} event${
                            listQuery.data.data.length === 1 ? "" : "s"
                          } in selected range`
                        : "Loading…"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4">
                    {listQuery.isLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ) : listQuery.error ? (
                      <EmptyState
                        title="Could not load activity"
                        description="The audit service did not respond. Try refreshing."
                      />
                    ) : (
                      <ActivityTimeline
                        logs={listQuery.data?.data ?? []}
                        loading={listQuery.isFetching}
                      />
                    )}
                  </CardContent>
                </Card>
              </>
            ),
          },
          {
            id: "anomalies",
            label: (
              <span>
                <ShieldAlert className="mr-1 inline h-4 w-4" aria-hidden="true" />
                Anomalies
                {anomaliesQuery.data && anomaliesQuery.data.length > 0 ? (
                  <span className="ml-2 rounded-full bg-red-100 px-2 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-200">
                    {anomaliesQuery.data.length}
                  </span>
                ) : null}
              </span>
            ),
            content: (
              <Card className="mt-4">
                <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                  <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-500" aria-hidden="true" />
                    Anomalies
                  </CardTitle>
                  <CardDescription>
                    Suspicious patterns: new IPs, bulk deletes, off-hours activity, role
                    escalations, failed-login bursts.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  {anomaliesQuery.isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : anomaliesQuery.data && anomaliesQuery.data.length > 0 ? (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                      {anomaliesQuery.data.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-3 py-3"
                          aria-label={`Anomaly ${a.action} severity ${
                            a.reasons[0]?.severity ?? "low"
                          }`}
                        >
                          <AnomalyDot
                            severity={a.reasons[0]?.severity ?? "low"}
                            title={a.reasons.map((r) => r.reason).join(", ")}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                              <span className="font-mono">{a.action}</span>
                              {a.entityType ? (
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                                  {a.entityType}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                              {new Date(a.createdAt).toLocaleString()} ·{" "}
                              {a.userId ?? "system"} ·{" "}
                              <span className="font-mono">{a.ipAddress ?? "—"}</span>
                            </div>
                          </div>
                          <AnomalyBadge
                            severity={a.reasons[0]?.severity ?? "low"}
                            reasons={a.reasons}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="No anomalies detected"
                      description="All clear. Anomaly detection runs on every audit event."
                    />
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: "stats",
            label: (
              <span>
                <BarChart3 className="mr-1 inline h-4 w-4" aria-hidden="true" />
                Stats
              </span>
            ),
            content: (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <Card>
                    <CardHeader>
                      <CardTitle>Total events</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {statsQuery.isLoading ? (
                        <Skeleton className="h-10 w-32" />
                      ) : (
                        <p className="text-3xl font-bold">
                          {statsQuery.data?.total ?? 0}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Anomalies</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {statsQuery.isLoading ? (
                        <Skeleton className="h-10 w-32" />
                      ) : (
                        <p className="text-3xl font-bold text-red-600">
                          {statsQuery.data?.anomalyCount ?? 0}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Active days</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {statsQuery.isLoading ? (
                        <Skeleton className="h-10 w-32" />
                      ) : (
                        <p className="text-3xl font-bold">
                          {statsQuery.data?.byDay.length ?? 0}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Top actions</CardTitle>
                      <CardDescription>25 most common event types.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {statsQuery.isLoading ? (
                        <Skeleton className="h-48 w-full" />
                      ) : (
                        <BarList
                          rows={(statsQuery.data?.byAction ?? []).map((r) => ({
                            key: r.action,
                            label: r.action,
                            count: r.count,
                            max: statsQuery.data?.byAction[0]?.count ?? 1,
                            color: "bg-blue-500",
                          }))}
                        />
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Top users</CardTitle>
                      <CardDescription>
                        Most active staff in selected range.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {statsQuery.isLoading ? (
                        <Skeleton className="h-48 w-full" />
                      ) : (
                        <BarList
                          rows={(statsQuery.data?.byUser ?? []).map((r) => ({
                            key: r.userId ?? "system",
                            label: r.name ?? r.userId ?? "system",
                            count: r.count,
                            max: statsQuery.data?.byUser[0]?.count ?? 1,
                            color: "bg-purple-500",
                          }))}
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ),
          },
        ]}
        defaultTab="timeline"
      />
    </PageContainer>
  );
}

/* ============================================================
 * Bar list (used in Stats tab)
 * ============================================================ */

function BarList({
  rows,
}: {
  rows: Array<{ key: string; label: string; count: number; max: number; color: string }>;
}): React.ReactElement {
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((row) => (
        <li
          key={row.key}
          className="flex items-center gap-2"
          aria-label={`${row.label}: ${row.count}`}
        >
          <span className="w-40 truncate font-mono text-xs text-gray-700 dark:text-gray-300">
            {row.label}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-900">
            <div
              className={`h-full rounded-full ${row.color}`}
              style={{
                width: `${Math.min(100, (row.count / Math.max(1, row.max)) * 100)}%`,
              }}
            />
          </div>
          <span className="w-10 text-right font-mono text-xs text-gray-600 dark:text-gray-400">
            {row.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ============================================================
 * Filter bar
 * ============================================================ */

interface FilterBarProps {
  actionInput: string;
  userIdInput: string;
  entityInput: string;
  from: string;
  to: string;
  onActionChange: (v: string) => void;
  onUserIdChange: (v: string) => void;
  onEntityChange: (v: string) => void;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear: () => void;
}

function FilterBar({
  actionInput,
  userIdInput,
  entityInput,
  from,
  to,
  onActionChange,
  onUserIdChange,
  onEntityChange,
  onFromChange,
  onToChange,
  onClear,
}: FilterBarProps): React.ReactElement {
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950 sm:grid-cols-2 lg:grid-cols-6">
      <FilterField label="Action">
        <input
          type="text"
          value={actionInput}
          onChange={(e) => onActionChange(e.target.value)}
          placeholder="e.g. lead.created"
          aria-label="Filter by action"
          className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-950"
        />
      </FilterField>
      <FilterField label="User">
        <input
          type="text"
          value={userIdInput}
          onChange={(e) => onUserIdChange(e.target.value)}
          placeholder="user id"
          aria-label="Filter by user"
          className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-950"
        />
      </FilterField>
      <FilterField label="Entity type">
        <input
          type="text"
          value={entityInput}
          onChange={(e) => onEntityChange(e.target.value)}
          placeholder="e.g. lead"
          aria-label="Filter by entity type"
          className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-950"
        />
      </FilterField>
      <FilterField label="From">
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          aria-label="Filter from date"
          className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-950"
        />
      </FilterField>
      <FilterField label="To">
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          aria-label="Filter to date"
          className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-950"
        />
      </FilterField>
      <div className="flex items-end">
        <Button variant="ghost" onClick={onClear} className="w-full">
          Clear filters
        </Button>
      </div>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-gray-600 dark:text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}
