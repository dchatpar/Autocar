/**
 * React Query hooks for inventory.
 *
 * - `useInventory`        — paginated vehicle list
 * - `useVinLookup`        — NHTSA-backed VIN decode
 * - `useCreateVehicle`    — persist a scanned VIN
 *
 * VIN scanning flow (called from `app/(app)/inventory/add.tsx`):
 *   1. expo-camera captures a photo of the VIN placard
 *   2. The decode is delegated to the server (`/inventory/lookup-vin`)
 *      which calls NHTSA VPIC. The server caches results for 7 days.
 *   3. The user confirms / edits the decoded fields, hits Save.
 *   4. `useCreateVehicle` POSTs the record and invalidates the list.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  api,
  type VehicleSummary,
  type VinLookupResult,
  type ListVehiclesParams,
  type CreateVehiclePayload,
} from "../lib/api";
import { storage, STORAGE_KEYS } from "../lib/storage";

const PAGE_SIZE = 24;

interface VehiclesPage {
  data: VehicleSummary[];
  pagination: { hasMore: boolean; cursor: string | null };
}

export const inventoryKeys = {
  all: ["inventory"] as const,
  list: (params: ListVehiclesParams) =>
    [...inventoryKeys.all, "list", params] as const,
  vin: (vin: string) => [...inventoryKeys.all, "vin", vin] as const,
};

export function useInventory(
  filter: Omit<ListVehiclesParams, "cursor"> = {},
): UseInfiniteQueryResult<InfiniteData<VehiclesPage>, Error> {
  return useInfiniteQuery<VehiclesPage, Error>({
    queryKey: inventoryKeys.list(filter),
    queryFn: async ({ pageParam }) => {
      const res = await api.listVehicles({
        ...filter,
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit: PAGE_SIZE,
      });
      storage.setJSON(
        STORAGE_KEYS.vehicleListCache(pageParam as string | undefined),
        res,
      );
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.pagination.cursor ?? undefined,
    staleTime: 60_000,
  });
}

export function useVinLookup(vin: string | null) {
  return useQuery<VinLookupResult, Error>({
    queryKey: inventoryKeys.vin(vin ?? ""),
    queryFn: async () => {
      if (!vin) throw new Error("VIN is required");
      return api.lookupVin(vin);
    },
    enabled: typeof vin === "string" && vin.length === 17,
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days, matches server cache
    retry: 1,
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation<VehicleSummary, Error, CreateVehiclePayload>({
    mutationFn: (payload) => api.createVehicle(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}
