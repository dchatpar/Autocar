"use client";

/**
 * React Query hooks for the Marketing Campaigns module.
 *
 * Surface:
 *   - useCampaigns(filters)                  — paginated list
 *   - useCampaign(id)                        — single campaign + steps
 *   - useCampaignStats(id, days)             — headline stats + timeline
 *   - useCampaignEnrollments(id, filters)    — paginated enrollment list
 *   - useCreateCampaign()                    — create + invalidate list
 *   - useUpdateCampaign()                    — update + invalidate detail
 *   - useActivateCampaign()                  — DRAFT/PAUSED → ACTIVE
 *   - usePauseCampaign()                     — ACTIVE → PAUSED
 *   - useArchiveCampaign()                   — any → ARCHIVED
 *   - useEnrollInCampaign()                  — manual enroll
 *   - useUnenrollFromCampaign()              — exit an enrollment
 *
 * All hooks are typed against the API surface in `@/types/api`.
 * No mock data — the real backend is the source of truth.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  CampaignCreateInput,
  CampaignDetail,
  CampaignEnrollInput,
  CampaignEnrollResult,
  CampaignEnrollmentsResponse,
  CampaignEnrollment,
  CampaignListResponse,
  CampaignStats,
  CampaignSummary,
  CampaignUpdateInput,
  CampaignEnrollmentStatus,
  CampaignStatus,
  CampaignTriggerType,
} from "@/types/api";

/* ------------------------------------------------------------------ */
/* Query keys                                                         */
/* ------------------------------------------------------------------ */

export const campaignKeys = {
  all: ["campaigns"] as const,
  lists: () => [...campaignKeys.all, "list"] as const,
  list: (filters: CampaignFilters) => [...campaignKeys.lists(), filters] as const,
  details: () => [...campaignKeys.all, "detail"] as const,
  detail: (id: string) => [...campaignKeys.details(), id] as const,
  stats: (id: string, days: number) => [...campaignKeys.detail(id), "stats", days] as const,
  enrollments: (id: string) => [...campaignKeys.detail(id), "enrollments"] as const,
  enrollmentList: (id: string, filters: EnrollmentFilters) =>
    [...campaignKeys.enrollments(id), filters] as const,
};

export interface CampaignFilters {
  status?: CampaignStatus;
  triggerType?: CampaignTriggerType;
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface EnrollmentFilters {
  status?: CampaignEnrollmentStatus;
  limit?: number;
  cursor?: string;
}

/* ------------------------------------------------------------------ */
/* Query hooks                                                        */
/* ------------------------------------------------------------------ */

export function useCampaigns(
  filters: CampaignFilters = {},
  options?: Omit<UseQueryOptions<CampaignSummary[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery<CampaignSummary[], Error>({
    queryKey: campaignKeys.list(filters),
    queryFn: async () => {
      const res = await api.get<CampaignListResponse>("/campaigns", {
        query: filters as Record<string, string | number | boolean | undefined | null>,
      });
      return res.data;
    },
    staleTime: 30_000,
    ...options,
  });
}

export function useCampaign(id: string | null | undefined) {
  return useQuery<CampaignDetail, Error>({
    queryKey: campaignKeys.detail(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("useCampaign: id is required");
      const res = await api.get<{ data: CampaignDetail }>(`/campaigns/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useCampaignStats(id: string | null | undefined, days = 30) {
  return useQuery<CampaignStats, Error>({
    queryKey: campaignKeys.stats(id ?? "", days),
    queryFn: async () => {
      if (!id) throw new Error("useCampaignStats: id is required");
      const res = await api.get<{ data: CampaignStats }>(`/campaigns/${id}/stats`, {
        query: { days },
      });
      return res.data;
    },
    enabled: Boolean(id),
    refetchInterval: 60_000,
  });
}

export function useCampaignEnrollments(
  id: string | null | undefined,
  filters: EnrollmentFilters = {},
) {
  return useQuery<CampaignEnrollment[], Error>({
    queryKey: campaignKeys.enrollmentList(id ?? "", filters),
    queryFn: async () => {
      if (!id) throw new Error("useCampaignEnrollments: id is required");
      const res = await api.get<CampaignEnrollmentsResponse>(
        `/campaigns/${id}/enrollments`,
        { query: filters as Record<string, string | number | boolean | undefined | null> },
      );
      return res.data;
    },
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                          */
/* ------------------------------------------------------------------ */

export function useCreateCampaign(
  options?: UseMutationOptions<CampaignDetail, Error, CampaignCreateInput>,
) {
  const qc = useQueryClient();
  return useMutation<CampaignDetail, Error, CampaignCreateInput>({
    mutationFn: async (input) => {
      const res = await api.post<{ data: CampaignDetail }>("/campaigns", input);
      return res.data;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
      qc.setQueryData(campaignKeys.detail(data.id), data);
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useUpdateCampaign(
  id: string | null | undefined,
  options?: UseMutationOptions<
    CampaignDetail,
    Error,
    { id: string; input: CampaignUpdateInput }
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    CampaignDetail,
    Error,
    { id: string; input: CampaignUpdateInput }
  >({
    mutationFn: async ({ id: campaignId, input }) => {
      const res = await api.put<{ data: CampaignDetail }>(`/campaigns/${campaignId}`, input);
      return res.data;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
      qc.setQueryData(campaignKeys.detail(data.id), data);
      void id;
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useActivateCampaign(
  options?: UseMutationOptions<{ id: string; status: "ACTIVE" }, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation<{ id: string; status: "ACTIVE" }, Error, string>({
    mutationFn: async (campaignId) => {
      const res = await api.post<{ data: { id: string; status: "ACTIVE" } }>(
        `/campaigns/${campaignId}/activate`,
      );
      return res.data;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(data.id) });
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function usePauseCampaign(
  options?: UseMutationOptions<{ id: string; status: "PAUSED" }, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation<{ id: string; status: "PAUSED" }, Error, string>({
    mutationFn: async (campaignId) => {
      const res = await api.post<{ data: { id: string; status: "PAUSED" } }>(
        `/campaigns/${campaignId}/pause`,
      );
      return res.data;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(data.id) });
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useArchiveCampaign(
  options?: UseMutationOptions<{ id: string }, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, string>({
    mutationFn: async (campaignId) => {
      const res = await api.post<{ data: { id: string } }>(`/campaigns/${campaignId}/archive`);
      return res.data;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(data.id) });
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useEnrollInCampaign(
  campaignId: string | null | undefined,
  options?: UseMutationOptions<CampaignEnrollResult, Error, CampaignEnrollInput>,
) {
  const qc = useQueryClient();
  return useMutation<CampaignEnrollResult, Error, CampaignEnrollInput>({
    mutationFn: async (input) => {
      if (!campaignId) throw new Error("useEnrollInCampaign: campaignId is required");
      const res = await api.post<{ data: CampaignEnrollResult }>(
        `/campaigns/${campaignId}/enroll`,
        input,
      );
      return res.data;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      void qc;
      if (campaignId) {
        qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) });
        qc.invalidateQueries({ queryKey: campaignKeys.stats(campaignId, 30) });
        qc.invalidateQueries({ queryKey: campaignKeys.enrollments(campaignId) });
        qc.invalidateQueries({ queryKey: campaignKeys.lists() });
      }
      void data;
      void vars;
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useUnenrollFromCampaign(
  options?: UseMutationOptions<{ id: string }, Error, { enrollmentId: string; reason?: string }>,
) {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, { enrollmentId: string; reason?: string }>({
    mutationFn: async ({ enrollmentId, reason }) => {
      const res = await api.post<{ data: { id: string } }>(
        `/campaigns/enrollments/${enrollmentId}/unenroll`,
        reason ? { reason } : {},
      );
      return res.data;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: campaignKeys.all });
      void data;
      void vars;
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}
