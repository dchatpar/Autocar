"use client";

/**
 * useLeadScoring — React Query hooks for the lead-score API.
 *
 * Endpoints covered:
 *   POST  /leads/:id/score              — recompute a single lead
 *   GET   /leads/:id/score/history      — last 100 score history rows
 *   GET   /leads/score/list             — score-filtered lead list
 *   GET   /leads/stats/distribution     — count by classification
 *   POST  /leads/batch-score            — admin/manager batch recompute
 *
 * The hook degrades gracefully when the API is offline: while the
 * backend isn't reachable, it returns a stub shape from MOCK_LEADS so
 * the UI keeps working. Once the API is wired in (NEXT_PUBLIC_API_URL
 * set and reachable), the live calls win.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Lead } from "@/types/api";
import { MOCK_LEADS } from "@/lib/mock-data";
import type {
  Classification,
  ScoreBadgeProps,
} from "@/components/leads/ScoreBadge";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export interface ScoreSignals {
  hasEmail: number;
  hasPhone: number;
  vehicleInInventory: number;
  budgetSpecified: number;
  contactedUnder24h: number;
  hasResponded: number;
  hasAppointment: number;
  hasReplied: number;
  highIntentSource: number;
  referralOrRepeat: number;
  noResponseAfter3Attempts: number;
  overdue7Days: number;
  unsubscribed: number;
  bouncedContact: number;
  lowQualitySource: number;
  duplicateOfCustomer: number;
  /** Index signature so a typed signals object is assignable to
   *  `Record<string, number>` for the tooltip / badge components. */
  [key: string]: number;
}

export interface ScoreTopSignal {
  rule: string;
  delta: number;
  label: string;
}

export interface ScoreResult {
  score: number;
  classification: Classification;
  signals: ScoreSignals;
  topSignals: ScoreTopSignal[];
  modelVersion: string;
  computeMs: number;
}

export interface ScoreHistoryItem {
  id: string;
  score: number;
  classification: Classification;
  signals: ScoreSignals;
  /** Top contributing signals — present on most rows. */
  topSignals?: ScoreTopSignal[] | null;
  modelVersion: string;
  scoredAt: string;
}

export interface ScoreHistoryResponse {
  data: ScoreHistoryItem[];
  pagination: { hasMore: boolean; cursor: string | null };
}

export interface ScoreListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  currentScore: number;
  classification: Classification;
  lastScoredAt: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreListResponse {
  data: ScoreListItem[];
  pagination: { hasMore: boolean; cursor: string | null };
}

export interface ScoreDistributionBucket {
  classification: Classification;
  count: number;
  pct: number;
}

export interface ScoreDistributionResponse {
  data: {
    total: number;
    buckets: ScoreDistributionBucket[];
  };
}

export interface ScoreRecomputeInput {
  id: string;
  trigger?: "lead_created" | "lead_updated" | "status_changed" | "manual";
}

export interface BatchScoreInput {
  limit?: number;
  olderThanHours?: number;
}

export interface BatchScoreResult {
  total: number;
  enqueued: number;
  direct: number;
}

/* ------------------------------------------------------------------ */
/* Query keys                                                         */
/* ------------------------------------------------------------------ */

export const scoreKeys = {
  all: ["lead-scores"] as const,
  history: (id: string) => [...scoreKeys.all, "history", id] as const,
  list: (filters: ScoreListFilters) => [...scoreKeys.all, "list", filters] as const,
  distribution: () => [...scoreKeys.all, "distribution"] as const,
};

export interface ScoreListFilters {
  minScore?: number;
  maxScore?: number;
  classification?: Classification;
  source?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

/* ------------------------------------------------------------------ */
/* Mock data — when the API is offline                                */
/* ------------------------------------------------------------------ */

function mockScore(lead: Lead): ScoreResult {
  // Lightweight signal derivation so the UI isn't empty before the
  // backend is wired up. Mirror the API rules loosely.
  const signals: ScoreSignals = {
    hasEmail: lead.email ? 20 : 0,
    hasPhone: lead.phone ? 20 : 0,
    vehicleInInventory: 0,
    budgetSpecified: 0,
    contactedUnder24h: 0,
    hasResponded: 0,
    hasAppointment: 0,
    hasReplied: 0,
    highIntentSource: 0,
    referralOrRepeat: 0,
    noResponseAfter3Attempts: 0,
    overdue7Days: 0,
    unsubscribed: 0,
    bouncedContact: 0,
    lowQualitySource: 0,
    duplicateOfCustomer: 0,
  };
  const total = Object.values(signals).reduce((a, b) => a + b, 0);
  return {
    score: lead.score ?? total,
    classification: classify(lead.score ?? total),
    signals,
    topSignals: Object.entries(signals)
      .filter(([, v]) => v !== 0)
      .map(([rule, delta]) => ({
        rule,
        delta,
        label: rule,
      })),
    modelVersion: "rules-v1",
    computeMs: 0,
  };
}

function classify(score: number): Classification {
  if (score <= 30) return "cold";
  if (score <= 60) return "warm";
  return "hot";
}

function mockHistory(leadId: string): ScoreHistoryResponse {
  const lead = MOCK_LEADS.find((l) => l.id === leadId);
  if (!lead) return { data: [], pagination: { hasMore: false, cursor: null } };
  const base = mockScore(lead);
  const now = Date.now();
  // 3 snapshots at -3d, -1d, now — simulates drift
  const samples = [
    { score: Math.max(0, base.score - 20), ago: 3 * 24 * 60 * 60 * 1000 },
    { score: Math.max(0, base.score - 10), ago: 1 * 24 * 60 * 60 * 1000 },
    { score: base.score, ago: 0 },
  ];
  return {
    data: samples.map((s, i) => ({
      id: `mock-${leadId}-${i}`,
      score: s.score,
      classification: classify(s.score),
      signals: base.signals,
      modelVersion: base.modelVersion,
      scoredAt: new Date(now - s.ago).toISOString(),
    })),
    pagination: { hasMore: false, cursor: null },
  };
}

function mockList(filters: ScoreListFilters): ScoreListResponse {
  let items = MOCK_LEADS.map((l) => {
    const r = mockScore(l);
    return {
      id: l.id,
      firstName: l.name.split(" ")[0] ?? l.name,
      lastName: l.name.split(" ").slice(1).join(" "),
      email: l.email,
      phone: l.phone,
      source: l.source,
      status: l.status,
      currentScore: r.score,
      classification: r.classification,
      lastScoredAt: l.updatedAt,
      assignedTo: l.assignedTo ? { id: l.assignedTo.id, name: l.assignedTo.name } : null,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  });
  if (filters.minScore !== undefined) items = items.filter((i) => i.currentScore >= (filters.minScore ?? 0));
  if (filters.maxScore !== undefined) items = items.filter((i) => i.currentScore <= (filters.maxScore ?? 100));
  if (filters.classification) items = items.filter((i) => i.classification === filters.classification);
  return {
    data: items,
    pagination: { hasMore: false, cursor: null },
  };
}

function mockDistribution(): ScoreDistributionResponse {
  const total = MOCK_LEADS.length;
  const buckets = ["cold", "warm", "hot"].map((c) => {
    const count = MOCK_LEADS.filter((l) => classify(l.score) === c).length;
    return {
      classification: c as Classification,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    };
  });
  return { data: { total, buckets } };
}

/* ------------------------------------------------------------------ */
/* Fetchers (real API)                                                */
/* ------------------------------------------------------------------ */

async function fetchHistory(leadId: string): Promise<ScoreHistoryResponse> {
  try {
    return await api.get<ScoreHistoryResponse>(
      `/leads/${leadId}/score/history?limit=100`,
    );
  } catch {
    return mockHistory(leadId);
  }
}

async function fetchList(filters: ScoreListFilters): Promise<ScoreListResponse> {
  const query: Record<string, string> = {};
  if (filters.minScore !== undefined) query.minScore = String(filters.minScore);
  if (filters.maxScore !== undefined) query.maxScore = String(filters.maxScore);
  if (filters.classification) query.classification = filters.classification;
  if (filters.source && filters.source !== "all") query.source = filters.source;
  if (filters.status && filters.status !== "all") query.status = filters.status;
  if (filters.limit) query.limit = String(filters.limit);
  if (filters.cursor) query.cursor = filters.cursor;
  try {
    return await api.get<ScoreListResponse>("/leads/score/list", { query });
  } catch {
    return mockList(filters);
  }
}

async function fetchDistribution(): Promise<ScoreDistributionResponse> {
  try {
    return await api.get<ScoreDistributionResponse>("/leads/stats/distribution");
  } catch {
    return mockDistribution();
  }
}

async function postRecompute(input: ScoreRecomputeInput): Promise<ScoreResult> {
  try {
    return await api.post<ScoreResult>(`/leads/${input.id}/score`, {
      trigger: input.trigger ?? "manual",
    });
  } catch {
    const lead = MOCK_LEADS.find((l) => l.id === input.id);
    if (!lead) throw new Error("Lead not found");
    return mockScore(lead);
  }
}

async function postBatchScore(input: BatchScoreInput): Promise<BatchScoreResult> {
  return api.post<BatchScoreResult>("/leads/batch-score", {
    limit: input.limit ?? 500,
    olderThanHours: input.olderThanHours ?? 24,
  });
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useLeadScoreHistory(
  leadId: string | null | undefined,
  options?: Omit<UseQueryOptions<ScoreHistoryResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<ScoreHistoryResponse, Error>({
    queryKey: scoreKeys.history(leadId ?? ""),
    queryFn: () => fetchHistory(leadId ?? ""),
    enabled: Boolean(leadId),
    staleTime: 30_000,
    ...options,
  });
}

export function useLeadScoreList(
  filters: ScoreListFilters = {},
  options?: Omit<UseQueryOptions<ScoreListResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<ScoreListResponse, Error>({
    queryKey: scoreKeys.list(filters),
    queryFn: () => fetchList(filters),
    staleTime: 30_000,
    ...options,
  });
}

export function useScoreDistribution(
  options?: Omit<UseQueryOptions<ScoreDistributionResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<ScoreDistributionResponse, Error>({
    queryKey: scoreKeys.distribution(),
    queryFn: () => fetchDistribution(),
    staleTime: 60_000,
    ...options,
  });
}

export function useRecomputeLeadScore(
  options?: UseMutationOptions<ScoreResult, Error, ScoreRecomputeInput>,
) {
  const qc = useQueryClient();
  return useMutation<ScoreResult, Error, ScoreRecomputeInput>({
    mutationFn: (input) => postRecompute(input),
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: scoreKeys.all });
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useBatchScore(
  options?: UseMutationOptions<BatchScoreResult, Error, BatchScoreInput>,
) {
  const qc = useQueryClient();
  return useMutation<BatchScoreResult, Error, BatchScoreInput>({
    mutationFn: (input) => postBatchScore(input),
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: scoreKeys.all });
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Project a lead into a ScoreListItem shape — used when the table
 *  wants the score column even when the score list endpoint is
 *  unavailable. */
export function leadToScoreItem(lead: Lead): ScoreListItem {
  const r = mockScore(lead);
  const [firstName, ...rest] = lead.name.split(" ");
  return {
    id: lead.id,
    firstName: firstName ?? lead.name,
    lastName: rest.join(" "),
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
    currentScore: r.score,
    classification: r.classification,
    lastScoredAt: lead.updatedAt,
    assignedTo: lead.assignedTo ? { id: lead.assignedTo.id, name: lead.assignedTo.name } : null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

/** Type alias so callers can pull the Classification from one place. */
export type { Classification };
export type { ScoreBadgeProps };
