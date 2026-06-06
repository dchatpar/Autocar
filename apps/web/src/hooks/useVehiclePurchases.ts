"use client";

/**
 * React Query hooks for Vehicle Purchases from Public (AdaptUs DMS Module 2.4).
 *
 * Endpoints:
 *  GET    /purchases
 *  POST   /purchases
 *  GET    /purchases/:id
 *  PUT    /purchases/:id
 *  DELETE /purchases/:id
 *  POST   /purchases/:id/print-pdf
 *
 * Mock-data backed until the API lands. The shape mirrors the shared
 * VehiclePurchase schema in `@dealeros/shared`.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { VehiclePurchase, CreateVehiclePurchaseInput, UpdateVehiclePurchaseInput, PurchaseStatus } from "@dealeros/shared";

/* ------------------------------------------------------------------ */
/* Query keys                                                         */
/* ------------------------------------------------------------------ */

export const vehiclePurchaseKeys = {
  all: ["vehicle-purchases"] as const,
  lists: () => [...vehiclePurchaseKeys.all, "list"] as const,
  list: (filters: VehiclePurchaseFilters) =>
    [...vehiclePurchaseKeys.lists(), filters] as const,
  details: () => [...vehiclePurchaseKeys.all, "detail"] as const,
  detail: (id: string) => [...vehiclePurchaseKeys.details(), id] as const,
};

export interface VehiclePurchaseFilters {
  status?: PurchaseStatus | "all";
  source?: string;
  search?: string;
}

/* ------------------------------------------------------------------ */
/* Mock data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_PURCHASES: VehiclePurchase[] = [
  {
    id: "vp_001",
    dealerId: "dealer_001",
    vehicleId: null,
    vin: "1HGCM82633A123456",
    year: 2019,
    make: "Honda",
    model: "Accord",
    trim: "Sport",
    odometer: 78432,
    exteriorColor: "Modern Steel",
    interiorColor: "Black",
    condition: "GOOD",
    purchaseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
    purchasePrice: 18500,
    source: "WALKIN",
    sellerType: "INDIVIDUAL",
    sellerName: "Jane Cooper",
    sellerPhone: "+1 604 555 0101",
    sellerEmail: "jane.cooper@example.com",
    sellerAddress: {
      street: "1234 W Pender St",
      city: "Vancouver",
      province: "BC",
      postalCode: "V6E 1G1",
      country: "Canada",
    },
    documents: [
      { type: "BILL_OF_SALE", fileName: "bill_of_sale.pdf", uploadedAt: new Date().toISOString() },
      { type: "OWNERSHIP", fileName: "ownership.pdf", uploadedAt: new Date().toISOString() },
    ],
    notes: "Single owner, no accidents. Carfax clean.",
    acceptedById: "u_001",
    checklist: { inspectionComplete: true, reconditioningNeeded: true, photosTaken: true, listed: false },
    status: "PENDING",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
  },
  {
    id: "vp_002",
    dealerId: "dealer_001",
    vehicleId: "veh_002",
    vin: "5TFAY5F12LX123789",
    year: 2020,
    make: "Toyota",
    model: "Tundra",
    trim: "TRD Pro",
    odometer: 54100,
    exteriorColor: "Army Green",
    interiorColor: "Black",
    condition: "EXCELLENT",
    purchaseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
    purchasePrice: 42000,
    source: "ONLINE",
    sellerType: "INDIVIDUAL",
    sellerName: "Marcus Lee",
    sellerPhone: "+1 778 555 0202",
    sellerEmail: "marcus.lee@example.com",
    notes: "Loaded trim, tow package, recent tires.",
    acceptedById: "u_002",
    checklist: { inspectionComplete: true, reconditioningNeeded: false, photosTaken: true, listed: true },
    status: "COMPLETED",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
  },
  {
    id: "vp_003",
    dealerId: "dealer_001",
    vehicleId: null,
    vin: "WBA8E9C58JA000111",
    year: 2018,
    make: "BMW",
    model: "330i",
    odometer: 92100,
    exteriorColor: "Alpine White",
    interiorColor: "Black",
    condition: "FAIR",
    purchaseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    purchasePrice: 15800,
    source: "PHONE",
    sellerType: "INDIVIDUAL",
    sellerName: "Pat Singh",
    sellerPhone: "+1 604 555 0303",
    notes: "Cold call lead. Two minor claims on Carfax.",
    acceptedById: null,
    checklist: { inspectionComplete: false, reconditioningNeeded: false, photosTaken: false, listed: false },
    status: "DRAFT",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
  },
];

let mockStore: VehiclePurchase[] = [...MOCK_PURCHASES];

function applyPurchaseFilters(
  list: VehiclePurchase[],
  filters: VehiclePurchaseFilters
): VehiclePurchase[] {
  return list.filter((p) => {
    if (filters.status && filters.status !== "all" && p.status !== filters.status) return false;
    if (filters.source && p.source !== filters.source) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${p.vin} ${p.make} ${p.model} ${p.sellerName} ${p.year}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

async function fetchVehiclePurchases(
  filters: VehiclePurchaseFilters
): Promise<VehiclePurchase[]> {
  // Real: return api.get<VehiclePurchase[]>("/api/purchases", { query: filters });
  await new Promise((r) => setTimeout(r, 150));
  return applyPurchaseFilters(mockStore, filters);
}

async function fetchVehiclePurchase(id: string): Promise<VehiclePurchase | null> {
  // Real: return api.get<VehiclePurchase>(`/api/purchases/${id}`);
  await new Promise((r) => setTimeout(r, 100));
  return mockStore.find((p) => p.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useVehiclePurchases(
  filters: VehiclePurchaseFilters = {},
  options?: Omit<UseQueryOptions<VehiclePurchase[], Error>, "queryKey" | "queryFn">
) {
  return useQuery<VehiclePurchase[], Error>({
    queryKey: vehiclePurchaseKeys.list(filters),
    queryFn: () => fetchVehiclePurchases(filters),
    ...options,
  });
}

export function useVehiclePurchase(
  id: string | null | undefined,
  options?: Omit<UseQueryOptions<VehiclePurchase | null, Error>, "queryKey" | "queryFn">
) {
  return useQuery<VehiclePurchase | null, Error>({
    queryKey: id ? vehiclePurchaseKeys.detail(id) : vehiclePurchaseKeys.detail("__none__"),
    queryFn: () => (id ? fetchVehiclePurchase(id) : Promise.resolve(null)),
    enabled: Boolean(id),
    ...options,
  });
}

export function useCreateVehiclePurchase(
  options?: Omit<UseMutationOptions<VehiclePurchase, Error, CreateVehiclePurchaseInput>, "mutationFn">
) {
  const qc = useQueryClient();
  return useMutation<VehiclePurchase, Error, CreateVehiclePurchaseInput>({
    mutationFn: async (input) => {
      // Real: return api.post<VehiclePurchase>("/api/purchases", input);
      await new Promise((r) => setTimeout(r, 250));
      const id = `vp_${String(mockStore.length + 1).padStart(3, "0")}`;
      const now = new Date();
      const created: VehiclePurchase = {
        id,
        dealerId: "dealer_001",
        vehicleId: null,
        ...input,
        documents: input.documents ?? [],
        checklist: input.checklist ?? {
          inspectionComplete: false,
          reconditioningNeeded: false,
          photosTaken: false,
          listed: false,
        },
        status: "PENDING",
        createdAt: now,
        updatedAt: now,
      };
      mockStore = [created, ...mockStore];
      return created;
    },
    onSuccess: (data, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: vehiclePurchaseKeys.lists() });
      qc.setQueryData(vehiclePurchaseKeys.detail(data.id), data);
      options?.onSuccess?.(data, vars, onMutateResult, ctx);
    },
    ...options,
  });
}

export function useUpdateVehiclePurchase(
  options?: Omit<UseMutationOptions<VehiclePurchase, Error, { id: string; input: UpdateVehiclePurchaseInput }>, "mutationFn">
) {
  const qc = useQueryClient();
  return useMutation<VehiclePurchase, Error, { id: string; input: UpdateVehiclePurchaseInput }>({
    mutationFn: async ({ id, input }) => {
      // Real: return api.put<VehiclePurchase>(`/api/purchases/${id}`, input);
      await new Promise((r) => setTimeout(r, 200));
      const idx = mockStore.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error("Purchase not found");
      const updated: VehiclePurchase = {
        ...mockStore[idx],
        ...input,
        updatedAt: new Date(),
      };
      mockStore = [...mockStore.slice(0, idx), updated, ...mockStore.slice(idx + 1)];
      return updated;
    },
    onSuccess: (data, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: vehiclePurchaseKeys.lists() });
      qc.setQueryData(vehiclePurchaseKeys.detail(data.id), data);
      options?.onSuccess?.(data, vars, onMutateResult, ctx);
    },
    ...options,
  });
}

export function useDeleteVehiclePurchase(
  options?: Omit<UseMutationOptions<{ id: string }, Error, { id: string }>, "mutationFn">
) {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      // Real: return api.delete<{ id: string }>(`/api/purchases/${id}`);
      await new Promise((r) => setTimeout(r, 150));
      mockStore = mockStore.filter((p) => p.id !== id);
      return { id };
    },
    onSuccess: (data, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: vehiclePurchaseKeys.lists() });
      qc.removeQueries({ queryKey: vehiclePurchaseKeys.detail(data.id) });
      options?.onSuccess?.(data, vars, onMutateResult, ctx);
    },
    ...options,
  });
}

export function usePrintPurchasePDF(
  options?: Omit<UseMutationOptions<{ url: string }, Error, { id: string }>, "mutationFn">
) {
  return useMutation<{ url: string }, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      // Real: return api.post<{ url: string }>(`/api/purchases/${id}/print-pdf`);
      await new Promise((r) => setTimeout(r, 400));
      return { url: `/api/purchases/${id}/bill-of-sale.pdf` };
    },
    ...options,
  });
}
