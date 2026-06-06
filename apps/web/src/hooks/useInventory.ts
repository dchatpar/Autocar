"use client";

/**
 * React Query hooks for inventory.
 * Mock-data backed until the API lands.
 */

import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import { MOCK_VEHICLES } from "@/lib/mock-data";
import { api } from "@/lib/api";
import type { Vehicle, VehicleFilters, VehicleStatus } from "@/types/api";

/* ------------------------------------------------------------------ */
/* Query keys                                                         */
/* ------------------------------------------------------------------ */

export const vehicleKeys = {
  all: ["vehicles"] as const,
  lists: () => [...vehicleKeys.all, "list"] as const,
  list: (filters: VehicleFilters) => [...vehicleKeys.lists(), filters] as const,
  details: () => [...vehicleKeys.all, "detail"] as const,
  detail: (id: string) => [...vehicleKeys.details(), id] as const,
  decode: (vin: string) => [...vehicleKeys.all, "decode", vin] as const,
};

/* ------------------------------------------------------------------ */
/* Fetcher                                                            */
/* ------------------------------------------------------------------ */

function applyFilters(vehicles: Vehicle[], f: VehicleFilters): Vehicle[] {
  return vehicles.filter((v) => {
    if (f.status && f.status !== "all" && v.status !== f.status) return false;
    if (f.make && f.make !== "all" && v.make !== f.make) return false;
    if (typeof f.minPrice === "number" && v.price < f.minPrice) return false;
    if (typeof f.maxPrice === "number" && v.price > f.maxPrice) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = `${v.vin} ${v.make} ${v.model} ${v.stockNumber} ${v.year}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

async function fetchVehicles(filters: VehicleFilters): Promise<Vehicle[]> {
  // Real: return api.get<Vehicle[]>("/api/vehicles", { query: filters as Record<string, string> });
  await new Promise((r) => setTimeout(r, 150));
  return applyFilters(MOCK_VEHICLES, filters);
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useInventory(
  filters: VehicleFilters = {},
  options?: Omit<UseQueryOptions<Vehicle[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery<Vehicle[], Error>({
    queryKey: vehicleKeys.list(filters),
    queryFn: () => fetchVehicles(filters),
    staleTime: 30_000,
    ...options,
  });
}

export function useVehicle(id: string | null | undefined) {
  return useQuery<Vehicle | null, Error>({
    queryKey: vehicleKeys.detail(id ?? ""),
    queryFn: async () => {
      if (!id) return null;
      // Real: return api.get<Vehicle>(`/api/vehicles/${id}`);
      await new Promise((r) => setTimeout(r, 100));
      return MOCK_VEHICLES.find((v) => v.id === id) ?? null;
    },
    enabled: Boolean(id),
  });
}

export function useCreateVehicle(
  options?: UseMutationOptions<Vehicle, Error, Partial<Vehicle>>,
) {
  const qc = useQueryClient();
  return useMutation<Vehicle, Error, Partial<Vehicle>>({
    mutationFn: async (input) => {
      // Real: return api.post<Vehicle>("/api/vehicles", input);
      await new Promise((r) => setTimeout(r, 250));
      const id = `vh_${Math.random().toString(36).slice(2, 8)}`;
      const vehicle: Vehicle = {
        id,
        vin: input.vin ?? "",
        stockNumber: input.stockNumber ?? `STK${Math.floor(Math.random() * 9000) + 1000}`,
        make: input.make ?? "",
        model: input.model ?? "",
        year: input.year ?? new Date().getFullYear(),
        trim: input.trim ?? "",
        price: input.price ?? 0,
        mileage: input.mileage ?? 0,
        color: input.color ?? "",
        status: input.status ?? "available",
        daysOnLot: 0,
        photoUrl: null,
        bodyStyle: input.bodyStyle ?? "Sedan",
        fuelType: input.fuelType ?? "Gas",
        transmission: input.transmission ?? "Automatic",
        createdAt: new Date().toISOString(),
      };
      MOCK_VEHICLES.unshift(vehicle);
      return vehicle;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: vehicleKeys.lists() });
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useUpdateVehicleStatus(
  options?: UseMutationOptions<Vehicle, Error, { id: string; status: VehicleStatus }>,
) {
  const qc = useQueryClient();
  return useMutation<Vehicle, Error, { id: string; status: VehicleStatus }>({
    mutationFn: async ({ id, status }) => {
      // Real: return api.patch<Vehicle>(`/api/vehicles/${id}`, { status });
      await new Promise((r) => setTimeout(r, 80));
      const v = MOCK_VEHICLES.find((x) => x.id === id);
      if (!v) throw new Error("Vehicle not found");
      const updated = { ...v, status };
      MOCK_VEHICLES[MOCK_VEHICLES.indexOf(v)] = updated;
      return updated;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: vehicleKeys.lists() });
      qc.setQueryData(vehicleKeys.detail(data.id), data);
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useDecodeVin(vin: string | null) {
  return useQuery<Partial<Vehicle> | null, Error>({
    queryKey: vehicleKeys.decode(vin ?? ""),
    queryFn: async () => {
      if (!vin || vin.length < 11) return null;
      // Real: return api.get<Partial<Vehicle>>(`/api/vin/${encodeURIComponent(vin)}`);
      await new Promise((r) => setTimeout(r, 400));
      // Simulated decode: pick a real-ish record from mock data.
      const sample = MOCK_VEHICLES[vin.charCodeAt(0) % MOCK_VEHICLES.length];
      return {
        make: sample.make,
        model: sample.model,
        year: sample.year,
        bodyStyle: sample.bodyStyle,
        fuelType: sample.fuelType,
        transmission: sample.transmission,
      };
    },
    enabled: Boolean(vin && vin.length >= 11),
    staleTime: Infinity,
  });
}

/* ------------------------------------------------------------------ */
/* URL-driven filter state                                            */
/* ------------------------------------------------------------------ */

export function useInventoryFiltersFromUrl(
  searchParams: URLSearchParams,
  setSearchParams: (next: URLSearchParams) => void,
) {
  const status = (searchParams.get("status") ?? "all") as VehicleFilters["status"];
  const make = searchParams.get("make") ?? "all";
  const minPriceRaw = searchParams.get("minPrice");
  const maxPriceRaw = searchParams.get("maxPrice");
  const search = searchParams.get("q") ?? "";

  const filters = useMemo<VehicleFilters>(
    () => ({
      status,
      make,
      minPrice: minPriceRaw ? Number(minPriceRaw) : undefined,
      maxPrice: maxPriceRaw ? Number(maxPriceRaw) : undefined,
      search,
    }),
    [status, make, minPriceRaw, maxPriceRaw, search],
  );

  function setFilter<K extends keyof VehicleFilters>(key: K, value: VehicleFilters[K] | "all" | "") {
    const next = new URLSearchParams(searchParams);
    const v = value ?? "";
    if (!v || v === "all") {
      next.delete(String(key));
    } else {
      next.set(String(key), String(v));
    }
    setSearchParams(next);
  }

  return { filters, setFilter, search, setSearch: (v: string) => setFilter("search", v) };
}
