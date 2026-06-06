/**
 * React Query hook for the LeadRoutingLog table on the settings page.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { routingKeys } from "./useRoutingConfig";
import type { RoutingLogRow } from "@/types/routing";

export function useRoutingLog(limit: number = 100) {
  return useQuery<RoutingLogRow[]>({
    queryKey: [...routingKeys.log(), limit] as const,
    queryFn: async () => {
      try {
        const res = await api.get<{ data: RoutingLogRow[] }>("/routing/log", {
          query: { limit },
        });
        return res.data;
      } catch {
        return [];
      }
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
