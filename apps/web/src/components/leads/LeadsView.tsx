"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { LayoutGrid, List, Plus, AlertCircle, RefreshCw, Flame, Sun, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/Skeleton";
import { LeadKanban } from "./LeadKanban";
import { LeadTable } from "./LeadTable";
import { useLeads, useUpdateLeadStatus, useLocalLeads } from "@/hooks/useLeads";
import { LEAD_SOURCES, USERS } from "@/lib/mock-data";
import type { Lead, LeadStatus } from "@/types/api";

const STATUS_OPTIONS: Array<{ value: LeadStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "test_drive", label: "Test drive" },
  { value: "negotiating", label: "Negotiating" },
  { value: "closed_won", label: "Closed won" },
  { value: "lost", label: "Lost" },
];

const SCORE_OPTIONS: Array<{ value: "all" | "hot" | "warm" | "cold"; label: string; icon: React.ReactNode }> = [
  { value: "all", label: "All scores", icon: null },
  { value: "hot", label: "Hot (61-100)", icon: <Flame className="h-3 w-3 text-[#22D3A0]" aria-hidden="true" /> },
  { value: "warm", label: "Warm (31-60)", icon: <Sun className="h-3 w-3 text-[#F97316]" aria-hidden="true" /> },
  { value: "cold", label: "Cold (0-30)", icon: <Snowflake className="h-3 w-3 text-[#EF4444]" aria-hidden="true" /> },
];

function deriveClassification(score: number): "cold" | "warm" | "hot" {
  if (score <= 30) return "cold";
  if (score <= 60) return "warm";
  return "hot";
}

type ViewMode = "kanban" | "table";

export function LeadsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // View mode persisted in localStorage (UI state only).
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "kanban";
    const stored = window.localStorage.getItem("leads.view");
    return stored === "table" ? "table" : "kanban";
  });
  const setViewMode = (v: ViewMode) => {
    setView(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("leads.view", v);
    }
  };

  // URL-driven filters
  const source = (searchParams.get("source") ?? "all") as Lead["source"] | "all";
  const status = (searchParams.get("status") ?? "all") as LeadStatus | "all";
  const assignedTo = searchParams.get("assigned_to") ?? "all";
  const q = searchParams.get("q") ?? "";
  const classification = (searchParams.get("classification") ?? "all") as
    | "all"
    | "cold"
    | "warm"
    | "hot";
  const minScoreParam = searchParams.get("min_score");
  const minScore = minScoreParam !== null ? Number.parseInt(minScoreParam, 10) : undefined;

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const filters = useMemo(
    () => ({ source, status, assignedTo, search: q, classification, minScore }),
    [source, status, assignedTo, q, classification, minScore],
  );

  const { data: leads, isLoading, isError, error, refetch, isFetching } = useLeads(filters);
  const { leads: localLeads, moveLead } = useLocalLeads(leads ?? []);
  const updateStatus = useUpdateLeadStatus();

  // Drag-and-drop handler — optimistically moves the card and fires the mutation.
  const handleMove = useCallback(
    (id: string, toStatus: LeadStatus) => {
      moveLead(id, toStatus);
      updateStatus.mutate({ id, status: toStatus });
    },
    [moveLead, updateStatus],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <Input
              placeholder="Search by name, email, vehicle…"
              value={q}
              onChange={(e) => setParam("q", e.target.value)}
              aria-label="Search leads"
            />
          </div>
          <div className="w-36">
            <Select
              options={[
                { value: "all", label: "All sources" },
                ...LEAD_SOURCES.map((s) => ({ value: s, label: s })),
              ]}
              value={source}
              onChange={(v) => setParam("source", v)}
              aria-label="Filter by source"
            />
          </div>
          <div className="w-40">
            <Select
              options={STATUS_OPTIONS}
              value={status}
              onChange={(v) => setParam("status", v)}
              aria-label="Filter by status"
            />
          </div>
          <div className="w-44">
            <Select
              options={[
                { value: "all", label: "All owners" },
                ...USERS.map((u) => ({ value: u.id, label: u.name })),
              ]}
              value={assignedTo}
              onChange={(v) => setParam("assigned_to", v)}
              aria-label="Filter by assigned user"
            />
          </div>
          <div className="w-44">
            <Select
              options={SCORE_OPTIONS}
              value={classification}
              onChange={(v) => setParam("classification", v)}
              aria-label="Filter by lead score"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="View mode"
            className="inline-flex rounded-lg border border-border bg-bg-card p-0.5"
          >
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              aria-pressed={view === "kanban"}
              className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium transition-colors ${
                view === "kanban"
                  ? "bg-accent text-bg-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              aria-pressed={view === "table"}
              className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium transition-colors ${
                view === "table"
                  ? "bg-accent text-bg-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <List className="h-4 w-4" aria-hidden="true" />
              <span>Table</span>
            </button>
          </div>
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            New lead
          </Button>
        </div>
      </div>

      {/* Content */}
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState view={view} />
      ) : view === "kanban" ? (
        <LeadKanban leads={localLeads} onMove={handleMove} isFetching={isFetching} />
      ) : (
        <LeadTable leads={localLeads} />
      )}

      {/* Result count */}
      {!isLoading && !isError && (
        <p className="text-xs text-text-muted text-center" aria-live="polite">
          {localLeads.length} lead{localLeads.length === 1 ? "" : "s"}
          {isFetching && " · refreshing…"}
        </p>
      )}
    </div>
  );
}

function LoadingState({ view }: { view: ViewMode }) {
  if (view === "kanban") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, col) => (
          <div key={col} className="bg-bg-card border border-border rounded-xl p-3 space-y-2 min-h-[300px]">
            <Skeleton height={20} width="60%" className="mb-3" />
            {Array.from({ length: 3 }).map((__, i) => (
              <Skeleton key={i} height={92} />
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} height={48} />
      ))}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 bg-bg-card border border-border rounded-xl">
      <AlertCircle className="h-8 w-8 text-danger" aria-hidden="true" />
      <p className="text-sm text-text-primary">Couldn't load leads.</p>
      <p className="text-xs text-text-muted">{error?.message ?? "Unknown error"}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" /> Retry
      </Button>
    </div>
  );
}
