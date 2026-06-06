"use client";

/**
 * /campaigns — Marketing Campaigns list page.
 *
 * Renders the user's campaigns as a grid of CampaignCard tiles.
 * Status / trigger filters, search, and per-card quick actions
 * (activate / pause / archive).
 */

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, Filter, Mail, MessageSquare, Users, TrendingUp, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { CampaignCard } from "@/components/campaigns/CampaignCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import {
  useCampaigns,
  useActivateCampaign,
  usePauseCampaign,
  useArchiveCampaign,
  type CampaignFilters,
} from "@/hooks/useCampaigns";
import type { CampaignStatus, CampaignTriggerType } from "@/types/api";
import { cn, formatNumber } from "@/lib/utils";

const STATUS_OPTIONS: ReadonlyArray<{ value: CampaignStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Archived" },
];

const TRIGGER_OPTIONS: ReadonlyArray<{ value: CampaignTriggerType | "all"; label: string }> = [
  { value: "all", label: "All triggers" },
  { value: "LEAD_CREATED", label: "New lead" },
  { value: "STATUS_CHANGE", label: "Status change" },
  { value: "NO_ACTIVITY", label: "No activity" },
  { value: "APPOINTMENT", label: "Appointment" },
  { value: "DEAL_STAGE", label: "Deal stage" },
  { value: "SCORE_CHANGE", label: "Score change" },
  { value: "BIRTHDAY", label: "Birthday" },
  { value: "VEHICLE_MATCH", label: "Vehicle match" },
  { value: "MANUAL", label: "Manual" },
  { value: "API", label: "API" },
];

export default function CampaignsPage() {
  const [status, setStatus] = useState<CampaignStatus | "all">("all");
  const [trigger, setTrigger] = useState<CampaignTriggerType | "all">("all");
  const [search, setSearch] = useState("");

  const filters = useMemo<CampaignFilters>(
    () => ({
      ...(status !== "all" ? { status } : {}),
      ...(trigger !== "all" ? { triggerType: trigger } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      limit: 50,
    }),
    [status, trigger, search],
  );

  const { data: campaigns, isLoading, isError, refetch } = useCampaigns(filters);
  const activate = useActivateCampaign();
  const pause = usePauseCampaign();
  const archive = useArchiveCampaign();

  const handleActivate = useCallback(
    (id: string) => activate.mutate(id),
    [activate],
  );
  const handlePause = useCallback(
    (id: string) => pause.mutate(id),
    [pause],
  );
  const handleArchive = useCallback(
    (id: string) => {
      if (!window.confirm("Archive this campaign? You can re-create it later.")) return;
      archive.mutate(id);
    },
    [archive],
  );

  const busy = activate.isPending || pause.isPending || archive.isPending;

  // Headline KPIs.
  const kpis = useMemo(() => {
    if (!campaigns) return null;
    return {
      total: campaigns.length,
      active: campaigns.filter((c) => c.status === "ACTIVE").length,
      enrolled: campaigns.reduce((sum, c) => sum + c.enrolledCount, 0),
      completed: campaigns.reduce((sum, c) => sum + c.completedCount, 0),
    };
  }, [campaigns]);

  return (
    <>
      <PageHeader
        title="Marketing campaigns"
        description="Drip sequences, lead nurturing, and automated workflows. Activate to start enrolling matching leads."
        actions={
          <Link
            href="/campaigns/new"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-accent text-bg-primary font-medium text-sm hover:bg-accent/90 active:scale-[0.98] transition-all shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-bg-primary"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>New campaign</span>
          </Link>
        }
      />

      {/* KPIs */}
      {kpis && kpis.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiTile label="Campaigns" value={kpis.total} icon={Mail} />
          <KpiTile label="Active" value={kpis.active} icon={TrendingUp} tone="success" />
          <KpiTile label="Enrolled" value={kpis.enrolled} icon={Users} tone="info" />
          <KpiTile label="Completed" value={kpis.completed} icon={CheckCircle2} tone="success" />
        </div>
      )}

      {/* Filter bar */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1 min-w-[200px] max-w-md">
            <Input
              placeholder="Search campaigns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              aria-label="Search campaigns"
            />
          </div>
          <div className="w-44">
            <Select
              options={[...STATUS_OPTIONS]}
              value={status}
              onChange={(v) => setStatus(v as CampaignStatus | "all")}
              aria-label="Filter by status"
            />
          </div>
          <div className="w-48">
            <Select
              options={[...TRIGGER_OPTIONS]}
              value={trigger}
              onChange={(v) => setTrigger(v as CampaignTriggerType | "all")}
              aria-label="Filter by trigger"
            />
          </div>
        </div>
      </Card>

      {/* List */}
      {isError ? (
        <EmptyState
          title="Couldn't load campaigns"
          description="Something went wrong reaching the server. Try refreshing the page."
          primaryAction={{ label: "Retry", onClick: () => void refetch() }}
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create your first drip sequence to start nurturing leads automatically."
          icon={<MessageSquare className="h-10 w-10 text-text-muted" aria-hidden="true" />}
          primaryAction={{
            label: "New campaign",
            onClick: () => {
              window.location.href = "/campaigns/new";
            },
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onActivate={handleActivate}
              onPause={handlePause}
              onArchive={handleArchive}
              busy={busy}
            />
          ))}
        </div>
      )}
    </>
  );
}

function KpiTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Mail;
  tone?: "success" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "info"
        ? "text-info"
        : "text-text-primary";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs uppercase tracking-wide font-medium">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold mt-1", toneClass)}>
        {formatNumber(value)}
      </p>
    </Card>
  );
}
