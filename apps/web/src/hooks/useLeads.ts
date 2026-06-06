"use client";

/**
 * React Query hooks for leads.
 *
 * While the backend is offline (most calls right now), these hooks read
 * from `MOCK_LEADS` and apply client-side filtering. Once the API is wired
 * in, replace the body of `fetchLeads` with a real `api.get` call.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryOptions, type UseMutationOptions } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MOCK_LEADS } from "@/lib/mock-data";
import { api } from "@/lib/api";
import type { Lead, LeadFilters, LeadStatus } from "@/types/api";

/* ------------------------------------------------------------------ */
/* Query keys                                                         */
/* ------------------------------------------------------------------ */

export const leadKeys = {
  all: ["leads"] as const,
  lists: () => [...leadKeys.all, "list"] as const,
  list: (filters: LeadFilters) => [...leadKeys.lists(), filters] as const,
  details: () => [...leadKeys.all, "detail"] as const,
  detail: (id: string) => [...leadKeys.details(), id] as const,
};

/* ------------------------------------------------------------------ */
/* Fetcher                                                            */
/* ------------------------------------------------------------------ */

function applyFilters(leads: Lead[], filters: LeadFilters): Lead[] {
  return leads.filter((lead) => {
    if (filters.source && filters.source !== "all" && lead.source !== filters.source) {
      return false;
    }
    if (filters.status && filters.status !== "all" && lead.status !== filters.status) {
      return false;
    }
    if (filters.assignedTo && filters.assignedTo !== "all" && lead.assignedTo?.id !== filters.assignedTo) {
      return false;
    }
    if (filters.classification && filters.classification !== "all") {
      const score = lead.currentScore ?? lead.score;
      const cls = lead.classification ?? deriveClassification(score);
      if (cls !== filters.classification) return false;
    }
    if (filters.minScore !== undefined) {
      const score = lead.currentScore ?? lead.score;
      if (score < filters.minScore) return false;
    }
    if (filters.maxScore !== undefined) {
      const score = lead.currentScore ?? lead.score;
      if (score > filters.maxScore) return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${lead.name} ${lead.email} ${lead.phone} ${lead.vehicleInterest}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function deriveClassification(score: number): "cold" | "warm" | "hot" {
  if (score <= 30) return "cold";
  if (score <= 60) return "warm";
  return "hot";
}

async function fetchLeads(filters: LeadFilters): Promise<Lead[]> {
  // Real call:
  // return api.get<Lead[]>("/api/leads", { query: filters as Record<string, string> });
  await new Promise((r) => setTimeout(r, 150));
  return applyFilters(MOCK_LEADS, filters);
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useLeads(
  filters: LeadFilters = {},
  options?: Omit<UseQueryOptions<Lead[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery<Lead[], Error>({
    queryKey: leadKeys.list(filters),
    queryFn: () => fetchLeads(filters),
    staleTime: 30_000,
    ...options,
  });
}

export function useLead(id: string | null | undefined) {
  return useQuery<Lead | null, Error>({
    queryKey: leadKeys.detail(id ?? ""),
    queryFn: async () => {
      if (!id) return null;
      // Real: return api.get<Lead>(`/api/leads/${id}`);
      await new Promise((r) => setTimeout(r, 100));
      return MOCK_LEADS.find((l) => l.id === id) ?? null;
    },
    enabled: Boolean(id),
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                          */
/* ------------------------------------------------------------------ */

export function useUpdateLeadStatus(
  options?: UseMutationOptions<Lead, Error, { id: string; status: LeadStatus }>,
) {
  const qc = useQueryClient();
  return useMutation<Lead, Error, { id: string; status: LeadStatus }>({
    mutationFn: async ({ id, status }) => {
      // Real: return api.patch<Lead>(`/api/leads/${id}`, { status });
      await new Promise((r) => setTimeout(r, 80));
      const lead = MOCK_LEADS.find((l) => l.id === id);
      if (!lead) throw new Error(`Lead ${id} not found`);
      const updated: Lead = { ...lead, status, updatedAt: new Date().toISOString() };
      const idx = MOCK_LEADS.findIndex((l) => l.id === id);
      MOCK_LEADS[idx] = updated;
      return updated;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: leadKeys.lists() });
      qc.setQueryData(leadKeys.detail(data.id), data);
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useCreateLead(
  options?: UseMutationOptions<Lead, Error, Partial<Lead>>,
) {
  const qc = useQueryClient();
  return useMutation<Lead, Error, Partial<Lead>>({
    mutationFn: async (input) => {
      await new Promise((r) => setTimeout(r, 200));
      const id = `ld_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const lead: Lead = {
        id,
        name: input.name ?? "Untitled Lead",
        email: input.email ?? "",
        phone: input.phone ?? "",
        source: input.source ?? "Other",
        status: input.status ?? "new",
        score: input.score ?? 25,
        assignedTo: input.assignedTo ?? null,
        vehicleInterest: input.vehicleInterest ?? "",
        notes: input.notes ?? "",
        createdAt: now,
        updatedAt: now,
      };
      MOCK_LEADS.unshift(lead);
      return lead;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: leadKeys.lists() });
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

/* ------------------------------------------------------------------ */
/* Helper hook — URL-driven filter state                              */
/* ------------------------------------------------------------------ */

export function useLeadFiltersFromUrl(
  searchParams: URLSearchParams,
  setSearchParams: (next: URLSearchParams) => void,
) {
  const source = (searchParams.get("source") ?? "all") as LeadFilters["source"];
  const status = (searchParams.get("status") ?? "all") as LeadFilters["status"];
  const assignedTo = searchParams.get("assigned_to") ?? "all";
  const search = searchParams.get("q") ?? "";

  const filters = useMemo<LeadFilters>(
    () => ({ source, status, assignedTo, search }),
    [source, status, assignedTo, search],
  );

  function setFilter<K extends keyof LeadFilters>(key: K, value: LeadFilters[K] | "all" | "") {
    const next = new URLSearchParams(searchParams);
    const v = value ?? "";
    if (!v || v === "all") next.delete(key === "assignedTo" ? "assigned_to" : key);
    else next.set(key === "assignedTo" ? "assigned_to" : String(v), String(v));
    setSearchParams(next);
  }

  return { filters, setFilter, search, setSearch: (v: string) => setFilter("search", v) };
}

/* ------------------------------------------------------------------ */
/* Local-view state for Kanban drag-drop                              */
/* ------------------------------------------------------------------ */

export function useLocalLeads(initial: Lead[]) {
  const [leads, setLeads] = useState<Lead[]>(initial);

  // Keep state in sync when initial changes (data refresh).
  const initialKey = initial.map((l) => `${l.id}:${l.status}`).join("|");
  const [lastKey, setLastKey] = useState(initialKey);
  if (initialKey !== lastKey) {
    setLeads(initial);
    setLastKey(initialKey);
  }

  function moveLead(id: string, toStatus: LeadStatus) {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, status: toStatus, updatedAt: new Date().toISOString() }
          : l,
      ),
    );
  }

  return { leads, moveLead, setLeads };
}
