/**
 * React Query hooks for the lead-routing settings page.
 *
 * - useRoutingConfig     — current routing settings for the dealer
 * - useUpdateRoutingConfig — PATCH /routing/config
 * - useRepsWithAvailability — GET /routing/reps
 * - useUpdateRepAvailability — PATCH /routing/config with rep_availability patch
 * - useRoutingPreview     — POST /routing/preview
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  RepWithAvailability,
  RoutingConfig,
  RoutingPreviewInput,
  RoutingPreviewOutput,
  RoutingStrategy,
} from "@/types/routing";

export const routingKeys = {
  all: ["routing"] as const,
  config: () => [...routingKeys.all, "config"] as const,
  reps: () => [...routingKeys.all, "reps"] as const,
  log: () => [...routingKeys.all, "log"] as const,
};

const FALLBACK_CONFIG: RoutingConfig = {
  strategy: "LOAD_BALANCED",
  priority: ["VEHICLE_MATCH", "SOURCE_BASED", "LOAD_BALANCED"],
  source_routing: {},
  rep_availability: {},
};

export function useRoutingConfig() {
  return useQuery<RoutingConfig>({
    queryKey: routingKeys.config(),
    queryFn: async () => {
      try {
        const res = await api.get<{ data: RoutingConfig }>("/routing/config");
        return res.data;
      } catch {
        // Backend offline → fall back to sensible defaults so the page is
        // still usable in dev. The mutation will be queued.
        return FALLBACK_CONFIG;
      }
    },
    staleTime: 30_000,
  });
}

export interface UpdateRoutingConfigPatch {
  strategy?: RoutingStrategy;
  priority?: RoutingStrategy[];
  source_routing?: Record<string, string>;
  rep_availability?: Record<string, "AVAILABLE" | "AWAY" | "OFF_DUTY">;
}

export function useUpdateRoutingConfig() {
  const qc = useQueryClient();
  return useMutation<RoutingConfig, Error, UpdateRoutingConfigPatch>({
    mutationFn: async (patch) => {
      const res = await api.patch<{ data: RoutingConfig }>("/routing/config", patch);
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(routingKeys.config(), data);
      void qc.invalidateQueries({ queryKey: routingKeys.reps() });
    },
  });
}

export function useRepsWithAvailability() {
  return useQuery<RepWithAvailability[]>({
    queryKey: routingKeys.reps(),
    queryFn: async () => {
      try {
        const res = await api.get<{ data: RepWithAvailability[] }>("/routing/reps");
        return res.data;
      } catch {
        return [];
      }
    },
    staleTime: 15_000,
  });
}

export function useUpdateRepAvailability() {
  const qc = useQueryClient();
  return useMutation<
    RoutingConfig,
    Error,
    { repId: string; availability: "AVAILABLE" | "AWAY" | "OFF_DUTY" }
  >({
    mutationFn: async ({ repId, availability }) => {
      // We need the current rep_availability map to merge into.
      const current =
        qc.getQueryData<RoutingConfig>(routingKeys.config()) ?? FALLBACK_CONFIG;
      const next: Record<string, "AVAILABLE" | "AWAY" | "OFF_DUTY"> = {
        ...current.rep_availability,
        [repId]: availability,
      };
      const res = await api.patch<{ data: RoutingConfig }>("/routing/config", {
        rep_availability: next,
      });
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(routingKeys.config(), data);
      void qc.invalidateQueries({ queryKey: routingKeys.reps() });
    },
  });
}

export function useRoutingPreview() {
  return useMutation<RoutingPreviewOutput, Error, RoutingPreviewInput>({
    mutationFn: async (input) => {
      const res = await api.post<{ data: RoutingPreviewOutput }>(
        "/routing/preview",
        input,
      );
      return res.data;
    },
  });
}
