"use client";

/**
 * React Query hooks for the activity-log audit trail.
 *
 * The hooks call the Fastify endpoints mounted at
 *   GET    /activity-logs
 *   GET    /activity-logs/:id
 *   GET    /activity-logs/stats
 *   GET    /activity-logs/anomalies
 *   GET    /entities/:type/:id/trail
 *   POST   /activity-logs/export
 *
 * While the backend is offline the hooks fall back to a deterministic
 * mock dataset so the UI is exercisable end-to-end.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { MOCK_ACTIVITY_LOGS } from "@/lib/mock-activity";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type AnomalySeverity = "low" | "medium" | "high";

export interface AnomalyReason {
  reason: string;
  severity: AnomalySeverity;
}

export interface ActivityLogRecord {
  id: string;
  dealerId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  diff: {
    changed: Array<{ field: string; before: unknown; after: unknown }>;
    added: string[];
    removed: string[];
  } | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AnomalyRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  reasons: AnomalyReason[];
  metadata: Record<string, unknown>;
}

export interface ActivityStats {
  range: { from: string; to: string };
  total: number;
  anomalyCount: number;
  byAction: Array<{ action: string; count: number }>;
  byUser: Array<{
    userId: string | null;
    name: string | null;
    email: string | null;
    role: string | null;
    count: number;
  }>;
  byDay: Array<{ day: string; count: number }>;
}

export interface ActivityLogFilters {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  anomaly?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: { hasMore: boolean; cursor: string | null };
}

export interface ExportArgs {
  from: string;
  to: string;
  format: "csv" | "json";
  userId?: string;
  action?: string;
  entityType?: string;
  anomalyOnly?: boolean;
  includeSnapshots?: boolean;
}

/* ------------------------------------------------------------------ */
/* Query keys                                                         */
/* ------------------------------------------------------------------ */

export const activityLogKeys = {
  all: ["activity-logs"] as const,
  lists: () => [...activityLogKeys.all, "list"] as const,
  list: (filters: ActivityLogFilters, cursor?: string) =>
    [...activityLogKeys.lists(), filters, cursor] as const,
  details: () => [...activityLogKeys.all, "detail"] as const,
  detail: (id: string) => [...activityLogKeys.details(), id] as const,
  stats: (from?: string, to?: string) =>
    [...activityLogKeys.all, "stats", from, to] as const,
  anomalies: (from?: string, to?: string) =>
    [...activityLogKeys.all, "anomalies", from, to] as const,
  trail: (entityType: string, entityId: string) =>
    [...activityLogKeys.all, "trail", entityType, entityId] as const,
};

/* ------------------------------------------------------------------ */
/* Fetchers                                                           */
/* ------------------------------------------------------------------ */

async function fetchActivityLogs(
  filters: ActivityLogFilters,
  cursor?: string,
  limit = 50,
): Promise<PaginatedResult<ActivityLogRecord>> {
  // Real call:
  // return api.get<PaginatedResult<ActivityLogRecord>>("/activity-logs", {
  //   query: { ...filters, cursor, limit },
  // });
  await new Promise((r) => setTimeout(r, 120));
  return paginateMock(applyFilters(MOCK_ACTIVITY_LOGS, filters), cursor, limit);
}

function applyFilters(
  logs: ActivityLogRecord[],
  filters: ActivityLogFilters,
): ActivityLogRecord[] {
  return logs.filter((l) => {
    if (filters.userId && l.userId !== filters.userId) return false;
    if (filters.action && !l.action.includes(filters.action)) return false;
    if (filters.entityType && l.entityType !== filters.entityType) return false;
    if (filters.entityId && l.entityId !== filters.entityId) return false;
    if (filters.from && new Date(l.createdAt) < new Date(filters.from)) return false;
    if (filters.to && new Date(l.createdAt) > new Date(filters.to)) return false;
    if (filters.anomaly && l.metadata.anomaly !== true) return false;
    return true;
  });
}

function paginateMock(
  logs: ActivityLogRecord[],
  cursor: string | undefined,
  limit: number,
): PaginatedResult<ActivityLogRecord> {
  let startIdx = 0;
  if (cursor) {
    const idx = logs.findIndex((l) => l.id === cursor);
    startIdx = idx >= 0 ? idx + 1 : 0;
  }
  const slice = logs.slice(startIdx, startIdx + limit + 1);
  const hasMore = slice.length > limit;
  const data = hasMore ? slice.slice(0, limit) : slice;
  const last = data[data.length - 1];
  return {
    data,
    pagination: { hasMore, cursor: hasMore && last ? last.id : null },
  };
}

async function fetchActivityLog(id: string): Promise<ActivityLogRecord> {
  // Real call:
  // const res = await api.get<{ data: ActivityLogRecord }>(`/activity-logs/${id}`);
  // return res.data;
  await new Promise((r) => setTimeout(r, 80));
  const found = MOCK_ACTIVITY_LOGS.find((l) => l.id === id);
  if (!found) throw new Error("Activity log not found");
  return found;
}

async function fetchStats(
  from?: string,
  to?: string,
): Promise<ActivityStats> {
  // Real call:
  // const res = await api.get<{ data: ActivityStats }>("/activity-logs/stats", { query: { from, to } });
  // return res.data;
  await new Promise((r) => setTimeout(r, 80));
  return computeMockStats(from, to);
}

async function fetchAnomalies(
  from?: string,
  to?: string,
): Promise<AnomalyRecord[]> {
  // Real call:
  // const res = await api.get<{ data: AnomalyRecord[] }>("/activity-logs/anomalies", { query: { from, to } });
  // return res.data;
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_ACTIVITY_LOGS.filter((l) => l.metadata.anomaly === true).map(
    (l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      userId: l.userId,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      createdAt: l.createdAt,
      reasons: (l.metadata.anomalyReasons as AnomalyReason[]) ?? [],
      metadata: l.metadata,
    }),
  );
}

async function fetchEntityTrail(
  entityType: string,
  entityId: string,
): Promise<ActivityLogRecord[]> {
  // Real call:
  // const res = await api.get<{ data: ActivityLogRecord[] }>(`/entities/${entityType}/${entityId}/trail`);
  // return res.data;
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_ACTIVITY_LOGS.filter(
    (l) => l.entityType === entityType && l.entityId === entityId,
  );
}

function computeMockStats(from?: string, to?: string): ActivityStats {
  const fromTs = from ? new Date(from).getTime() : 0;
  const toTs = to ? new Date(to).getTime() : Date.now();
  const within = MOCK_ACTIVITY_LOGS.filter((l) => {
    const ts = new Date(l.createdAt).getTime();
    return ts >= fromTs && ts <= toTs;
  });
  const byAction = new Map<string, number>();
  const byUser = new Map<string, number>();
  const byDay = new Map<string, number>();
  for (const l of within) {
    byAction.set(l.action, (byAction.get(l.action) ?? 0) + 1);
    const k = l.userId ?? "system";
    byUser.set(k, (byUser.get(k) ?? 0) + 1);
    const day = l.createdAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return {
    range: {
      from: from ?? new Date(fromTs || Date.now() - 30 * 86400_000).toISOString(),
      to: to ?? new Date(toTs).toISOString(),
    },
    total: within.length,
    anomalyCount: within.filter((l) => l.metadata.anomaly === true).length,
    byAction: Array.from(byAction.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25),
    byUser: Array.from(byUser.entries())
      .map(([userId, count]) => ({ userId, name: null, email: null, role: null, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25),
    byDay: Array.from(byDay.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useActivityLogs(
  filters: ActivityLogFilters = {},
  options?: Omit<UseQueryOptions<PaginatedResult<ActivityLogRecord>>, "queryKey" | "queryFn">,
) {
  const cursor = undefined;
  return useQuery({
    queryKey: activityLogKeys.list(filters, cursor),
    queryFn: () => fetchActivityLogs(filters, cursor),
    ...options,
  });
}

export function useInfiniteActivityLogs(
  filters: ActivityLogFilters = {},
  limit = 50,
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["activity-logs", "infinite", filters, limit],
    queryFn: async () => {
      const all: ActivityLogRecord[] = [];
      let cursor: string | undefined = undefined;
       
      while (true) {
        const page: PaginatedResult<ActivityLogRecord> = await fetchActivityLogs(
          filters,
          cursor,
          limit,
        );
        all.push(...page.data);
        if (!page.pagination.hasMore || !page.pagination.cursor) break;
        cursor = page.pagination.cursor;
        if (all.length > 500) break; // safety cap
      }
      return all;
    },
  });
  return useMemo(
    () => ({
      ...query,
      // allow manual refetch
      refetch: () => {
        queryClient.invalidateQueries({ queryKey: activityLogKeys.all });
        return query.refetch();
      },
    }),
    [query, queryClient],
  );
}

export function useActivityLog(
  id: string,
  options?: Omit<UseQueryOptions<ActivityLogRecord>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: activityLogKeys.detail(id),
    queryFn: () => fetchActivityLog(id),
    enabled: Boolean(id),
    ...options,
  });
}

export function useActivityStats(
  from?: string,
  to?: string,
  options?: Omit<UseQueryOptions<ActivityStats>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: activityLogKeys.stats(from, to),
    queryFn: () => fetchStats(from, to),
    ...options,
  });
}

export function useAnomalies(
  from?: string,
  to?: string,
  options?: Omit<UseQueryOptions<AnomalyRecord[]>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: activityLogKeys.anomalies(from, to),
    queryFn: () => fetchAnomalies(from, to),
    ...options,
  });
}

export function useEntityTrail(
  entityType: string,
  entityId: string,
  options?: Omit<UseQueryOptions<ActivityLogRecord[]>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: activityLogKeys.trail(entityType, entityId),
    queryFn: () => fetchEntityTrail(entityType, entityId),
    enabled: Boolean(entityType && entityId),
    ...options,
  });
}

export function useExportActivityLogs(
  options?: UseMutationOptions<Blob, Error, ExportArgs>,
) {
  return useMutation<Blob, Error, ExportArgs>({
    mutationFn: async (args) => {
      // Real call:
      // return api.post<Blob>("/activity-logs/export", args, { responseType: "blob" });
      await new Promise((r) => setTimeout(r, 200));
      const text = args.format === "json"
        ? JSON.stringify({ data: MOCK_ACTIVITY_LOGS.slice(0, 5) }, null, 2)
        : "id,action\n" + MOCK_ACTIVITY_LOGS.slice(0, 5).map((l) => `${l.id},${l.action}`).join("\n");
      return new Blob([text], { type: args.format === "json" ? "application/json" : "text/csv" });
    },
    ...options,
  });
}
