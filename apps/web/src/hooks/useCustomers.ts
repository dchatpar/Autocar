"use client";

/**
 * React Query hooks for customers.
 * Mock-data backed until the API lands.
 */

import { useQuery, useQueryClient, type UseQueryOptions, useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import { MOCK_CUSTOMERS, MOCK_DEALS, MOCK_VEHICLES } from "@/lib/mock-data";
import { api } from "@/lib/api";
import type {
  Customer,
  CustomerDetail,
  CustomerNote,
  CustomerTimelineEvent,
  CreditTier,
} from "@/types/api";

/* ------------------------------------------------------------------ */
/* Query keys                                                         */
/* ------------------------------------------------------------------ */

export const customerKeys = {
  all: ["customers"] as const,
  lists: () => [...customerKeys.all, "list"] as const,
  list: (filters: { search?: string; tier?: CreditTier | "all" }) =>
    [...customerKeys.lists(), filters] as const,
  details: () => [...customerKeys.all, "detail"] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
};

/* ------------------------------------------------------------------ */
/* Fetcher                                                            */
/* ------------------------------------------------------------------ */

async function fetchCustomers(filters: { search?: string; tier?: CreditTier | "all" }): Promise<Customer[]> {
  // Real: return api.get<Customer[]>("/api/customers", { query: filters });
  await new Promise((r) => setTimeout(r, 150));
  return MOCK_CUSTOMERS.filter((c) => {
    if (filters.tier && filters.tier !== "all" && c.creditTier !== filters.tier) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${c.name} ${c.email} ${c.phone}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

async function fetchCustomer(id: string): Promise<CustomerDetail | null> {
  // Real: return api.get<CustomerDetail>(`/api/customers/${id}`);
  await new Promise((r) => setTimeout(r, 200));
  const base = MOCK_CUSTOMERS.find((c) => c.id === id);
  if (!base) return null;

  const notes: CustomerNote[] = [
    {
      id: `nt_${id}_1`,
      authorId: "u_002",
      authorName: "Lisa Park",
      body: "Customer prefers text over phone calls. Best time is after 5pm.",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
    },
    {
      id: `nt_${id}_2`,
      authorId: "u_001",
      authorName: "Marcus Chen",
      body: "Trade-in: 2019 Honda Civic, ~52k miles. Wants to discuss payoff.",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
    },
  ];

  const timeline: CustomerTimelineEvent[] = [
    {
      id: `tl_${id}_1`,
      type: "lead",
      title: "Lead created",
      detail: "Source: Website",
      timestamp: base.createdAt,
    },
    {
      id: `tl_${id}_2`,
      type: "call",
      title: "Outbound call",
      detail: "Discussed available inventory",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    },
    {
      id: `tl_${id}_3`,
      type: "test_drive",
      title: "Test drive scheduled",
      detail: "2024 Toyota RAV4 — Saturday 2pm",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    },
    {
      id: `tl_${id}_4`,
      type: "email",
      title: "Email sent",
      detail: "Follow-up with pricing options",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    },
  ];

  const deals = MOCK_DEALS.filter((d) => d.customerId === id);
  const vehiclesOfInterest = MOCK_VEHICLES.slice(0, 3);

  return {
    ...base,
    notes,
    timeline,
    deals,
    vehiclesOfInterest,
  };
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useCustomers(
  filters: { search?: string; tier?: CreditTier | "all" } = {},
  options?: Omit<UseQueryOptions<Customer[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery<Customer[], Error>({
    queryKey: customerKeys.list(filters),
    queryFn: () => fetchCustomers(filters),
    staleTime: 30_000,
    ...options,
  });
}

export function useCustomer(id: string | null | undefined) {
  return useQuery<CustomerDetail | null, Error>({
    queryKey: customerKeys.detail(id ?? ""),
    queryFn: () => fetchCustomer(id ?? ""),
    enabled: Boolean(id),
  });
}

/* ------------------------------------------------------------------ */
/* URL-driven filters                                                 */
/* ------------------------------------------------------------------ */

export function useCustomerFiltersFromUrl(
  searchParams: URLSearchParams,
  setSearchParams: (next: URLSearchParams) => void,
) {
  const tier = (searchParams.get("tier") ?? "all") as CreditTier | "all";
  const search = searchParams.get("q") ?? "";

  const filters = useMemo(
    () => ({ tier, search }),
    [tier, search],
  );

  function setFilter(key: "tier" | "search", value: string) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  }

  return { filters, setFilter, search, setSearch: (v: string) => setFilter("search", v) };
}

/* ------------------------------------------------------------------ */
/* Add note mutation (optimistic-ish)                                 */
/* ------------------------------------------------------------------ */

export function useAddCustomerNote(customerId: string) {
  const qc = useQueryClient();
  return {
    addNote: async (body: string) => {
      const note: CustomerNote = {
        id: `nt_${Date.now()}`,
        authorId: "u_001",
        authorName: "Marcus Chen",
        body,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<CustomerDetail | null>(customerKeys.detail(customerId), (prev) =>
        prev ? { ...prev, notes: [note, ...prev.notes] } : prev,
      );
      // Real: return api.post(`/api/customers/${customerId}/notes`, { body });
      await new Promise((r) => setTimeout(r, 150));
      return note;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Create customer mutation                                            */
/* ------------------------------------------------------------------ */

export interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  creditScore?: number;
  source?: string;
  notes?: string;
  tags?: string[];
}

export function useCreateCustomer(
  options?: Omit<UseMutationOptions<Customer, Error, CreateCustomerInput>, "mutationFn">
) {
  const qc = useQueryClient();
  return useMutation<Customer, Error, CreateCustomerInput>({
    mutationFn: async (input) => {
      // Real: return api.post<Customer>("/api/customers", input);
      await new Promise((r) => setTimeout(r, 200));
      const id = `c_${Date.now().toString(36)}`;
      const created: Customer = {
        id,
        name: `${input.firstName} ${input.lastName}`.trim(),
        email: input.email ?? "",
        phone: input.phone ?? "",
        creditTier: "C",
        creditScore: input.creditScore ?? 680,
        address: {
          street: input.address?.street ?? "",
          city: input.address?.city ?? "",
          state: input.address?.state ?? "",
          zip: input.address?.zip ?? "",
        },
        vehicles: [],
        openDeals: 0,
        lifetimeValue: 0,
        lastContact: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      MOCK_CUSTOMERS.unshift(created);
      return created;
    },
    onSuccess: (data, vars, onMutateResult, ctx) => {
      qc.invalidateQueries({ queryKey: customerKeys.lists() });
      options?.onSuccess?.(data, vars, onMutateResult, ctx);
    },
    ...options,
  });
}
