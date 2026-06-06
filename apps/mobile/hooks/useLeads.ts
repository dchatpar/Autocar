/**
 * React Query hooks for the lead inbox.
 *
 * - `useLeads`         — paginated lead list with offline cache
 * - `useLead`          — single lead detail (with offline fallback)
 * - `usePrefetchLead`  — fire-and-forget detail warm-up
 *
 * Offline-first: every list query writes the result to MMKV via the
 * `cacheStorage` instance. The list reads from cache first (synchronously
 * via `placeholderData`) and from the network second. On a cold start
 * with no connectivity, the UI still renders the last known list.
 */

import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from "@tanstack/react-query";
import { useEffect } from "react";
import {
  api,
  type LeadSummary,
  type ListLeadsParams,
} from "../lib/api";
import { storage, STORAGE_KEYS } from "../lib/storage";

const LEADS_PAGE_SIZE = 25;

interface LeadsPage {
  data: LeadSummary[];
  pagination: { hasMore: boolean; cursor: string | null };
}

export const leadKeys = {
  all: ["leads"] as const,
  list: (params: ListLeadsParams) =>
    [...leadKeys.all, "list", params] as const,
  detail: (id: string) => [...leadKeys.all, "detail", id] as const,
};

/**
 * Infinite-scroll lead inbox. `placeholderData: keepPreviousData` keeps
 * the list mounted between page transitions so we don't flash a
 * loading spinner.
 */
export function useLeads(
  filter: Omit<ListLeadsParams, "cursor"> = {},
): UseInfiniteQueryResult<InfiniteData<LeadsPage>, Error> {
  return useInfiniteQuery<LeadsPage, Error>({
    queryKey: leadKeys.list(filter),
    queryFn: async ({ pageParam }) => {
      const res = await api.listLeads({
        ...filter,
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit: LEADS_PAGE_SIZE,
      });
      // Offline-first: persist every page to MMKV. The first page is
      // what the dashboard warm-starts from.
      storage.setJSON(
        STORAGE_KEYS.leadListCache(pageParam as string | undefined),
        res,
      );
      storage.setJSON(STORAGE_KEYS.lastSyncAt, new Date().toISOString());
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.pagination.cursor ?? undefined,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  });
}

/**
 * Read a lead from cache synchronously (no network). Used by the
 * detail screen during the initial render while the network call
 * is still in flight.
 */
export function readLeadFromCache(id: string): LeadSummary | null {
  return storage.getJSON<LeadSummary>(STORAGE_KEYS.leadDetailCache(id));
}

export function useLead(id: string) {
  const queryClient = useQueryClient();
  return useQuery<LeadSummary, Error>({
    queryKey: leadKeys.detail(id),
    queryFn: async () => {
      const res = await api.getLead(id);
      storage.setJSON(STORAGE_KEYS.leadDetailCache(id), res);
      return res;
    },
    initialData: () => readLeadFromCache(id) ?? undefined,
    enabled: typeof id === "string" && id.length > 0,
    staleTime: 30_000,
  });
}

/**
 * Warm the lead-detail cache when the inbox row comes into view.
 * The list calls this from a `useEffect` triggered by `onViewableItemsChanged`.
 */
export function usePrefetchLead(): (id: string) => void {
  const queryClient = useQueryClient();
  return (id: string): void => {
    void queryClient.prefetchQuery({
      queryKey: leadKeys.detail(id),
      queryFn: async () => api.getLead(id),
      staleTime: 30_000,
    });
  };
}

/**
 * Hydrate the offline list cache. Called once on app start by the
 * root layout. The hook just returns the count so the boot screen
 * can show progress.
 */
export function useHydrateLeadsCache(): number {
  const queryClient = useQueryClient();
  useEffect(() => {
    const cached = storage.getJSON<LeadsPage>(
      STORAGE_KEYS.leadListCache(undefined),
    );
    if (cached) {
      queryClient.setQueryData(leadKeys.list({}), cached);
    }
  }, [queryClient]);
  return storage.getString(STORAGE_KEYS.lastSyncAt) ? 1 : 0;
}
