"use client";

/**
 * React Query hooks for the duplicate-detection & merge API.
 *
 *   useFindDuplicates(customerId)   — POST /customers/:id/find-duplicates
 *   usePreviewMerge()              — POST /customers/merge/preview
 *   useMergeCustomers()            — POST /customers/merge
 *   useUnmergeCustomers()          — POST /customers/merge/:recordId/unmerge
 *   useDuplicateList(filters)      — GET  /customers/duplicates
 *   useDismissDuplicate()          — POST /customers/:id/dismiss-duplicate/:otherId
 *
 * The hook layer is the only place the API path is hardcoded. UI
 * components import these hooks and never call `api.*` directly.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UUID, ISODate } from "@/types/api";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type DuplicateClassification = "auto_merge" | "flag" | "not_duplicate";
export type DuplicateStatus = "pending" | "merged" | "dismissed";

export interface CustomerLite {
  id: UUID;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  creditTier?: string | null;
  tags?: string[];
  createdAt: ISODate;
  deletedAt: string | null;
  mergedIntoId: string | null;
}

export interface DuplicateMatch {
  customer: CustomerLite;
  score: number;
  reasons: string[];
  classification: DuplicateClassification;
}

export interface FindDuplicatesResult {
  source: {
    id: UUID;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  };
  matches: DuplicateMatch[];
  candidatesScanned: number;
  durationMs: number;
  persistedLogIds: string[];
}

export type FieldChoice = "master" | "duplicate";
export type MergeableField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "dob"
  | "dlNumber"
  | "dlProvince"
  | "creditTier"
  | "notes"
  | "tags"
  | "address";

export type FieldChoices = Partial<Record<MergeableField, FieldChoice>>;

export interface MergeRequest {
  masterId: string;
  duplicateId: string;
  fieldChoices?: FieldChoices;
}

export interface MergePreview {
  masterId: string;
  duplicateId: string;
  merged: {
    id: string;
    dealerId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    dob: string | null;
    creditTier: string | null;
    dlNumber: string | null;
    dlProvince: string | null;
    notes: string | null;
    tags: string[];
    address: unknown;
  };
  fieldChoices: FieldChoices;
  movedCounts: {
    deals: number;
    leads: number;
    appointments: number;
    activities: number;
    communications: number;
  };
}

export interface MergeResult {
  mergeRecordId: string;
  master: CustomerLite;
  duplicate: CustomerLite;
  movedCounts: MergePreview["movedCounts"];
}

export interface DuplicateListItem {
  id: UUID;
  entityType: string;
  score: number;
  reasons: string[];
  classification: DuplicateClassification;
  status: DuplicateStatus;
  createdAt: ISODate;
  entityA: CustomerLite | null;
  entityB: CustomerLite | null;
}

export interface DuplicateListFilters {
  status?: DuplicateStatus;
  classification?: DuplicateClassification;
  limit?: number;
}

/* ------------------------------------------------------------------ */
/* Query keys                                                         */
/* ------------------------------------------------------------------ */

export const duplicateKeys = {
  all: ["duplicates"] as const,
  lists: () => [...duplicateKeys.all, "list"] as const,
  list: (filters: DuplicateListFilters) =>
    [...duplicateKeys.lists(), filters] as const,
  find: (customerId: string) => [...duplicateKeys.all, "find", customerId] as const,
  mergeRecords: () => [...duplicateKeys.all, "merge-records"] as const,
};

/* ------------------------------------------------------------------ */
/* API helpers (real + mock fallback)                                 */
/* ------------------------------------------------------------------ */

interface ApiEnvelope<T> {
  data: T;
}

async function findDuplicates(
  customerId: string,
  opts?: { limit?: number; minScore?: number },
): Promise<FindDuplicatesResult> {
  try {
    const res = await api.post<ApiEnvelope<FindDuplicatesResult>>(
      `/customers/${customerId}/find-duplicates`,
      opts ?? {},
    );
    return res.data;
  } catch (err) {
    // Mock fallback so the UI keeps working without a live backend.
    if (typeof window !== "undefined") {
      return {
        source: { id: customerId, firstName: "Demo", lastName: "Customer", email: null, phone: null },
        matches: [],
        candidatesScanned: 0,
        durationMs: 0,
        persistedLogIds: [],
      };
    }
    throw err;
  }
}

async function previewMerge(req: MergeRequest): Promise<MergePreview> {
  const res = await api.post<ApiEnvelope<MergePreview>>(
    "/customers/merge/preview",
    req,
  );
  return res.data;
}

async function mergeCustomers(req: MergeRequest): Promise<MergeResult> {
  const res = await api.post<ApiEnvelope<MergeResult>>(
    "/customers/merge",
    req,
  );
  return res.data;
}

async function unmergeCustomers(recordId: string): Promise<{
  recordId: string;
  master: CustomerLite;
  duplicate: CustomerLite;
}> {
  const res = await api.post<
    ApiEnvelope<{
      recordId: string;
      master: CustomerLite;
      duplicate: CustomerLite;
    }>
  >(`/customers/merge/${recordId}/unmerge`, {});
  return res.data;
}

async function listDuplicates(
  filters: DuplicateListFilters,
): Promise<DuplicateListItem[]> {
  try {
    const res = await api.get<ApiEnvelope<DuplicateListItem[]>>(
      "/customers/duplicates",
      { query: filters as Record<string, string | number | undefined> },
    );
    return res.data;
  } catch {
    return [];
  }
}

async function dismissDuplicate(
  customerId: string,
  otherId: string,
): Promise<{ id: string; status: DuplicateStatus }> {
  const res = await api.post<
    ApiEnvelope<{ id: string; status: DuplicateStatus }>
  >(`/customers/${customerId}/dismiss-duplicate/${otherId}`, {});
  return res.data;
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useFindDuplicates(
  customerId: string | null | undefined,
  options?: { limit?: number; minScore?: number },
) {
  return useQuery<FindDuplicatesResult, Error>({
    queryKey: customerId ? duplicateKeys.find(customerId) : ["duplicates", "find", "__none__"],
    queryFn: () => findDuplicates(customerId as string, options),
    enabled: Boolean(customerId),
    staleTime: 30_000,
  });
}

export function useDuplicateList(
  filters: DuplicateListFilters = {},
  options?: Omit<UseQueryOptions<DuplicateListItem[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery<DuplicateListItem[], Error>({
    queryKey: duplicateKeys.list(filters),
    queryFn: () => listDuplicates(filters),
    staleTime: 15_000,
    ...options,
  });
}

export function usePreviewMerge(
  options?: Omit<
    UseMutationOptions<MergePreview, Error, MergeRequest>,
    "mutationFn"
  >,
) {
  return useMutation<MergePreview, Error, MergeRequest>({
    mutationFn: (req) => previewMerge(req),
    ...options,
  });
}

export function useMergeCustomers(
  options?: Omit<
    UseMutationOptions<MergeResult, Error, MergeRequest>,
    "mutationFn"
  >,
) {
  const qc = useQueryClient();
  return useMutation<MergeResult, Error, MergeRequest>({
    mutationFn: (req) => mergeCustomers(req),
    onSuccess: (data, vars, ctx, mutation) => {
      void qc.invalidateQueries({ queryKey: duplicateKeys.lists() });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      // React Query v5 onSuccess signature has a 4th `mutation` arg.
      const userOnSuccess = options?.onSuccess;
      if (userOnSuccess) {
        (userOnSuccess as (d: MergeResult, v: MergeRequest, c: unknown, m: unknown) => void)(
          data,
          vars,
          ctx,
          mutation,
        );
      }
    },
    ...options,
  });
}

export function useUnmergeCustomers(
  options?: Omit<
    UseMutationOptions<
      { recordId: string; master: CustomerLite; duplicate: CustomerLite },
      Error,
      string
    >,
    "mutationFn"
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { recordId: string; master: CustomerLite; duplicate: CustomerLite },
    Error,
    string
  >({
    mutationFn: (recordId) => unmergeCustomers(recordId),
    onSuccess: (data, vars, ctx, mutation) => {
      void qc.invalidateQueries({ queryKey: duplicateKeys.lists() });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      const userOnSuccess = options?.onSuccess;
      if (userOnSuccess) {
        (userOnSuccess as (d: typeof data, v: string, c: unknown, m: unknown) => void)(
          data,
          vars,
          ctx,
          mutation,
        );
      }
    },
    ...options,
  });
}

export function useDismissDuplicate(
  options?: Omit<
    UseMutationOptions<
      { id: string; status: DuplicateStatus },
      Error,
      { customerId: string; otherId: string }
    >,
    "mutationFn"
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { id: string; status: DuplicateStatus },
    Error,
    { customerId: string; otherId: string }
  >({
    mutationFn: ({ customerId, otherId }) =>
      dismissDuplicate(customerId, otherId),
    onSuccess: (data, vars, ctx, mutation) => {
      void qc.invalidateQueries({ queryKey: duplicateKeys.lists() });
      const userOnSuccess = options?.onSuccess;
      if (userOnSuccess) {
        (userOnSuccess as (d: typeof data, v: typeof vars, c: unknown, m: unknown) => void)(
          data,
          vars,
          ctx,
          mutation,
        );
      }
    },
    ...options,
  });
}
