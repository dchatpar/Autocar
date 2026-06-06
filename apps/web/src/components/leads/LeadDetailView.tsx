"use client";

/**
 * LeadDetailView — client view for a single lead. Renders the contact
 * card, the score badge + history chart, the contributing-signals
 * breakdown, and a recompute button.
 *
 * The lead body (name, phone, email, source, status, vehicle interest,
 * notes) is read from the existing useLead hook. The score + history
 * are read from the new useLeadScoring hooks.
 */

import { useState } from "react";
import Link from "next/link";
import {
  Phone,
  Mail,
  Car,
  Calendar,
  Clock,
  User,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Tag,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLead } from "@/hooks/useLeads";
import {
  useLeadScoreHistory,
  useRecomputeLeadScore,
  type ScoreSignals,
  type ScoreTopSignal,
} from "@/hooks/useLeadScoring";
import { ScoreBadge, ScoreBar, type Classification } from "./ScoreBadge";
import { ScoreHistoryChart } from "./ScoreHistoryChart";
import { ScoreSignalsTooltip } from "./ScoreSignalsTooltip";
import { cn, formatDate, formatDistanceToNow, formatPhone } from "@/lib/utils";
import type { LeadStatus } from "@/types/api";

interface LeadDetailViewProps {
  leadId: string;
}

const STATUS_VARIANT: Record<LeadStatus, "info" | "muted" | "warning" | "accent" | "success" | "danger"> = {
  new: "info",
  contacted: "muted",
  test_drive: "warning",
  negotiating: "accent",
  closed_won: "success",
  lost: "danger",
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  test_drive: "Test drive",
  negotiating: "Negotiating",
  closed_won: "Closed won",
  lost: "Lost",
};

interface SignalRow {
  key: string;
  label: string;
  delta: number;
  tone: "positive" | "negative" | "neutral";
}

const SIGNAL_LABELS: Record<string, string> = {
  hasEmail: "Has email",
  hasPhone: "Has valid phone",
  vehicleInInventory: "Vehicle in inventory",
  budgetSpecified: "Budget specified",
  contactedUnder24h: "Contacted within 24h",
  hasResponded: "Responded",
  hasAppointment: "Appointment scheduled",
  hasReplied: "Replied to outreach",
  highIntentSource: "High-intent source",
  referralOrRepeat: "Referral / repeat",
  noResponseAfter3Attempts: "No response after 3+ attempts",
  overdue7Days: "Overdue >7 days",
  unsubscribed: "Unsubscribed / not interested",
  bouncedContact: "Bounced contact",
  lowQualitySource: "Low-quality source",
  duplicateOfCustomer: "Duplicate of customer",
};

export function LeadDetailView({ leadId }: LeadDetailViewProps) {
  const { data: lead, isLoading, isError, error, refetch } = useLead(leadId);
  const { data: history, isLoading: historyLoading, refetch: refetchHistory } =
    useLeadScoreHistory(leadId);
  const recompute = useRecomputeLeadScore();
  const [lastRecomputed, setLastRecomputed] = useState<string | null>(null);

  function handleRecompute(): void {
    recompute.mutate(
      { id: leadId, trigger: "manual" },
      {
        onSuccess: () => {
          setLastRecomputed(new Date().toISOString());
          void refetchHistory();
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Card>
          <div className="flex items-center gap-4">
            <Skeleton variant="circular" width={64} height={64} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="40%" height={24} />
              <Skeleton variant="text" width="60%" />
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton height={240} />
            <Skeleton height={200} />
          </div>
          <div className="space-y-4">
            <Skeleton height={160} />
            <Skeleton height={240} />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !lead) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 bg-bg-card border border-border rounded-xl">
        <AlertCircle className="h-8 w-8 text-danger" aria-hidden="true" />
        <p className="text-sm text-text-primary">Couldn't load this lead.</p>
        <p className="text-xs text-text-muted">{error?.message ?? "Unknown error"}</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  // The "latest" score in the history is the most recent recompute.
  const historyItems = history?.data ?? [];
  const latestScore = historyItems[0] ?? null;
  const currentScore = lead.score ?? latestScore?.score ?? 0;
  const currentClassification: Classification = latestScore?.classification ?? derive(currentScore);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center text-bg-primary text-lg font-semibold flex-shrink-0"
              style={{ backgroundColor: lead.assignedTo?.avatarColor ?? "#E8FF47" }}
              aria-hidden="true"
            >
              {lead.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold text-text-primary truncate">{lead.name}</h2>
                <Badge variant={STATUS_VARIANT[lead.status as LeadStatus]}>
                  {STATUS_LABEL[lead.status as LeadStatus] ?? lead.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-text-muted flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" aria-hidden="true" />
                  {formatPhone(lead.phone)}
                </span>
                <span className="inline-flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{lead.email}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Tag className="h-3 w-3" aria-hidden="true" />
                  {lead.source}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  Updated {formatDistanceToNow(lead.updatedAt)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ScoreBadge
              score={currentScore}
              classification={currentClassification}
              signals={latestScore?.signals}
              size="md"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRecompute}
              disabled={recompute.isPending}
              aria-label="Recompute lead score"
            >
              <RefreshCw
                className={cn("h-4 w-4", recompute.isPending && "animate-spin")}
                aria-hidden="true"
              />
              {recompute.isPending ? "Recomputing…" : "Recompute score"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT — score chart + signals */}
        <div className="lg:col-span-2 space-y-4">
          <ScoreHistoryChart
            data={historyItems.map((h) => ({
              id: h.id,
              score: h.score,
              classification: h.classification,
              scoredAt: h.scoredAt,
            }))}
            isLoading={historyLoading}
            currentScore={currentScore}
            currentClassification={currentClassification}
          />

          <SignalsCard
            signals={latestScore?.signals ?? null}
            topSignals={(latestScore?.topSignals as ScoreTopSignal[] | null) ?? null}
            onRecompute={handleRecompute}
            isRecomputing={recompute.isPending}
            lastRecomputed={lastRecomputed}
            modelVersion={latestScore?.modelVersion ?? "rules-v1"}
          />
        </div>

        {/* RIGHT — contact, activity, vehicle */}
        <div className="space-y-4">
          <ContactCard lead={lead} />
          <VehicleInterestCard lead={lead} />
          <NotesCard notes={lead.notes} />
        </div>
      </div>
    </div>
  );
}

function derive(score: number): Classification {
  if (score <= 30) return "cold";
  if (score <= 60) return "warm";
  return "hot";
}

/* ============================================================
 * Sub-components
 * ============================================================ */

function SignalsCard({
  signals,
  topSignals,
  onRecompute,
  isRecomputing,
  lastRecomputed,
  modelVersion,
}: {
  signals: ScoreSignals | null;
  topSignals: ScoreTopSignal[] | null;
  onRecompute: () => void;
  isRecomputing: boolean;
  lastRecomputed: string | null;
  modelVersion: string;
}) {
  const rows: SignalRow[] = signals
    ? (Object.entries(signals) as Array<[string, number]>)
        .filter(([, v]) => v !== 0)
        .map(([key, delta]) => ({
          key,
          label: SIGNAL_LABELS[key] ?? key,
          delta,
          tone: (delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral") as SignalRow["tone"],
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    : [];

  const positive = rows.filter((r) => r.tone === "positive").reduce((s, r) => s + r.delta, 0);
  const negative = rows.filter((r) => r.tone === "negative").reduce((s, r) => s + r.delta, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Score breakdown</CardTitle>
            <CardDescription>
              Why this lead is scored {positive + negative}/100
            </CardDescription>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-text-muted font-mono">
            {modelVersion}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">
            No active signals. Recompute to refresh.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-[#22D3A0] font-semibold tabular-nums">
                +{positive}
              </span>
              <ScoreBar
                score={Math.max(0, Math.min(100, positive + negative))}
                classification={derive(Math.max(0, Math.min(100, positive + negative)))}
                showTrendIcon={false}
                className="flex-1"
              />
              <span className="text-xs text-[#EF4444] font-semibold tabular-nums">
                {negative}
              </span>
            </div>
            <ul className="space-y-1.5">
              {rows.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0"
                >
                  <span className="text-sm text-text-primary flex-1 min-w-0 truncate">
                    {row.label}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums font-semibold text-sm",
                      row.tone === "positive" && "text-[#22D3A0]",
                      row.tone === "negative" && "text-[#EF4444]",
                      row.tone === "neutral" && "text-text-muted",
                    )}
                  >
                    {row.delta > 0 ? "+" : ""}
                    {row.delta}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {lastRecomputed && (
          <p className="text-[10px] text-text-muted mt-3 inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Last recompute: {formatDistanceToNow(lastRecomputed)}
          </p>
        )}
        {topSignals && topSignals.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/40">
            <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-2">
              Top signals
            </p>
            <ul className="space-y-1 text-xs">
              {topSignals.map((s) => (
                <li
                  key={s.rule}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-text-primary truncate">{s.label}</span>
                  <span
                    className={cn(
                      "tabular-nums font-semibold flex-shrink-0",
                      s.delta > 0 ? "text-[#22D3A0]" : "text-[#EF4444]",
                    )}
                  >
                    {s.delta > 0 ? "+" : ""}
                    {s.delta}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Hidden helper that exposes the tooltip wrapper for keyboard users */}
        <span className="sr-only">
          <ScoreSignalsTooltip signals={signals} topSignals={topSignals}>
            <span>Score signals tooltip</span>
          </ScoreSignalsTooltip>
        </span>
      </CardContent>
    </Card>
  );
}

function ContactCard({ lead }: { lead: { name: string; phone: string; email: string; assignedTo: { name: string } | null; createdAt: string } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Row icon={Phone} label="Phone" value={formatPhone(lead.phone)} href={`tel:${lead.phone}`} />
        <Row icon={Mail} label="Email" value={lead.email} href={`mailto:${lead.email}`} />
        <Row icon={User} label="Assigned to" value={lead.assignedTo?.name ?? "Unassigned"} />
        <Row icon={Calendar} label="Created" value={formatDate(lead.createdAt)} />
      </CardContent>
    </Card>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-text-muted mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
          {label}
        </p>
        {href ? (
          <Link
            href={href}
            className="text-sm text-text-primary hover:text-accent transition-colors truncate block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            {value}
          </Link>
        ) : (
          <p className="text-sm text-text-primary truncate">{value}</p>
        )}
      </div>
    </div>
  );
}

function VehicleInterestCard({ lead }: { lead: { vehicleInterest: string } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vehicle interest</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-primary inline-flex items-center gap-2">
          <Car className="h-4 w-4 text-accent" aria-hidden="true" />
          {lead.vehicleInterest || "—"}
        </p>
      </CardContent>
    </Card>
  );
}

function NotesCard({ notes }: { notes: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent>
        {notes ? (
          <p className="text-sm text-text-primary whitespace-pre-wrap">{notes}</p>
        ) : (
          <p className="text-sm text-text-muted italic">No notes yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
