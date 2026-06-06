"use client";

/**
 * /campaigns/[id] — campaign detail page.
 *
 * Renders stats, the ordered step list, and the paginated enrollment
 * table. Owners can activate / pause / archive the campaign from the
 * header; enrollments can be unenrolled from the table.
 */

import { useCallback, useState, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Play,
  Pause,
  Archive,
  Users,
  Calendar,
  Tag,
  Zap,
  Mail,
  MessageSquare,
  CheckCircle2,
  Activity,
  Clock,
  AlertCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/EmptyState";

import { StatsOverview } from "@/components/campaigns/StatsOverview";
import { EnrollmentTable, useEnrollmentStatusFilter } from "@/components/campaigns/EnrollmentTable";

import {
  useCampaign,
  useCampaignStats,
  useCampaignEnrollments,
  useActivateCampaign,
  usePauseCampaign,
  useArchiveCampaign,
  useUnenrollFromCampaign,
  useEnrollInCampaign,
} from "@/hooks/useCampaigns";

import { cn, formatDate, formatDistanceToNow } from "@/lib/utils";
import type { CampaignStatus, CampaignStepType, CampaignTriggerType } from "@/types/api";

const STATUS_BADGE: Record<CampaignStatus, { variant: "info" | "muted" | "warning" | "success" | "danger"; label: string }> = {
  DRAFT: { variant: "muted", label: "Draft" },
  ACTIVE: { variant: "success", label: "Active" },
  PAUSED: { variant: "warning", label: "Paused" },
  ARCHIVED: { variant: "danger", label: "Archived" },
};

const TRIGGER_LABEL: Record<CampaignTriggerType, string> = {
  LEAD_CREATED: "On new lead",
  LEAD_UPDATED: "On lead update",
  STATUS_CHANGE: "On status change",
  NO_ACTIVITY: "On inactivity",
  DEAL_STAGE: "On deal stage",
  APPOINTMENT: "On appointment",
  SCORE_CHANGE: "On score change",
  BIRTHDAY: "On birthday",
  VEHICLE_MATCH: "On vehicle match",
  MANUAL: "Manual only",
  API: "API only",
};

const STEP_TYPE_META: Record<
  CampaignStepType,
  { icon: LucideIcon; tone: "info" | "warning" | "accent" | "muted" | "success" | "danger"; label: string }
> = {
  EMAIL: { icon: Mail, tone: "info", label: "Email" },
  SMS: { icon: MessageSquare, tone: "info", label: "SMS" },
  WAIT: { icon: Clock, tone: "warning", label: "Wait" },
  BRANCH: { icon: Zap, tone: "accent", label: "Branch" },
  WEBHOOK: { icon: Tag, tone: "muted", label: "Webhook" },
  TASK: { icon: CheckCircle2, tone: "success", label: "Task" },
  EXIT: { icon: XCircle, tone: "danger", label: "Exit" },
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const wasCreated = searchParams.get("created") === "1";
  const [statusFilter, setStatusFilter] = useEnrollmentStatusFilter("all");
  const [enrollmentsCursor, setEnrollmentsCursor] = useState<string | undefined>(undefined);

  const { data: campaign, isLoading, isError, refetch } = useCampaign(id);
  const { data: stats, isLoading: statsLoading } = useCampaignStats(id, 30);
  const enrollmentsQuery = useCampaignEnrollments(id, {
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    limit: 50,
    ...(enrollmentsCursor ? { cursor: enrollmentsCursor } : {}),
  });

  const activate = useActivateCampaign();
  const pause = usePauseCampaign();
  const archive = useArchiveCampaign();
  const unenroll = useUnenrollFromCampaign();
  const enroll = useEnrollInCampaign(id);

  const handleActivate = useCallback(() => campaign && activate.mutate(campaign.id), [activate, campaign]);
  const handlePause = useCallback(() => campaign && pause.mutate(campaign.id), [pause, campaign]);
  const handleArchive = useCallback(() => {
    if (!campaign) return;
    if (!window.confirm("Archive this campaign? You can re-create it later.")) return;
    archive.mutate(campaign.id);
  }, [archive, campaign]);
  const handleUnenroll = useCallback(
    async (enrollmentId: string) => {
      await unenroll.mutateAsync({ enrollmentId });
    },
    [unenroll],
  );
  const handleEnrollAudience = useCallback(() => {
    if (!campaign) return;
    enroll.mutate({ useAudience: true, replace: false });
  }, [campaign, enroll]);

  const enrollments = enrollmentsQuery.data ?? [];
  const enrollmentsPagination = (enrollmentsQuery as { pagination?: { hasMore: boolean; cursor: string | null } }).pagination ?? { hasMore: false, cursor: null };

  const status = campaign ? STATUS_BADGE[campaign.status] : null;
  const busy = activate.isPending || pause.isPending || archive.isPending || enroll.isPending;

  if (isError) {
    return (
      <EmptyState
        title="Couldn't load campaign"
        description="It may have been deleted or you may not have access."
        primaryAction={{ label: "Back to campaigns", onClick: () => router.push("/campaigns") }}
      />
    );
  }

  if (isLoading || !campaign) {
    return (
      <>
        <PageHeader title="Loading…" description="Fetching campaign details." />
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Created banner */}
      {wasCreated && (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"
        >
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">Campaign created</p>
            <p className="text-text-muted mt-0.5">
              You can keep editing, or activate it from the header when you&apos;re ready.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.replace(`/campaigns/${id}`)}
            aria-label="Dismiss"
            className="text-text-muted hover:text-text-primary"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      <PageHeader
        title={campaign.name}
        description={campaign.description ?? undefined}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {status && <Badge variant={status.variant}>{status.label}</Badge>}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => router.push(`/campaigns/${id}/edit`)}
              aria-label="Edit campaign"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Button>
            {campaign.status === "DRAFT" && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleActivate}
                disabled={busy}
                aria-label="Activate campaign"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Activate</span>
              </Button>
            )}
            {campaign.status === "ACTIVE" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handlePause}
                disabled={busy}
                aria-label="Pause campaign"
              >
                <Pause className="h-3.5 w-3.5" />
                <span>Pause</span>
              </Button>
            )}
            {campaign.status === "PAUSED" && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleActivate}
                disabled={busy}
                aria-label="Resume campaign"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Resume</span>
              </Button>
            )}
            {campaign.status !== "ARCHIVED" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleArchive}
                disabled={busy}
                aria-label="Archive campaign"
                className="text-text-muted hover:text-danger"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Archive</span>
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to campaigns
        </Link>
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetaCard
          icon={Zap}
          label="Trigger"
          value={TRIGGER_LABEL[campaign.triggerType]}
          sublabel={Object.keys(campaign.triggerConfig).length > 0 ? JSON.stringify(campaign.triggerConfig) : undefined}
        />
        <MetaCard
          icon={Users}
          label="Owner"
          value={campaign.createdBy.name}
          sublabel={`Created ${formatDistanceToNow(campaign.createdAt)} ago`}
        />
        <MetaCard
          icon={Calendar}
          label="Created"
          value={formatDate(campaign.createdAt)}
          sublabel={campaign.activatedAt ? `Activated ${formatDistanceToNow(campaign.activatedAt)} ago` : "Not yet activated"}
        />
        <MetaCard
          icon={Activity}
          label="Status"
          value={status?.label ?? "—"}
          sublabel={
            campaign.archivedAt
              ? `Archived ${formatDistanceToNow(campaign.archivedAt)} ago`
              : undefined
          }
        />
      </div>

      <Tabs
        tabs={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <div>
                <StatsOverview stats={stats} isLoading={statsLoading} days={30} />
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleEnrollAudience}
                    disabled={busy || campaign.status === "ARCHIVED"}
                    aria-label="Enroll matching audience"
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>Enroll matching audience now</span>
                  </Button>
                  <p className="text-xs text-text-muted">
                    Runs the audience filter and enqueues every match as a new enrollment.
                  </p>
                </div>
                {enroll.isSuccess && (
                  <p className="text-xs text-success mt-2">
                    Enrolled {enroll.data?.enrolled ?? 0} · skipped {enroll.data?.skipped ?? 0}
                  </p>
                )}
                {enroll.isError && (
                  <p className="text-xs text-danger mt-2">
                    {enroll.error?.message ?? "Failed to enroll."}
                  </p>
                )}
              </div>
            ),
          },
          {
            id: "steps",
            label: `Steps (${campaign.steps.length})`,
            content: (
              <div>
                {campaign.steps.length === 0 ? (
                  <EmptyState
                    title="No steps"
                    description="This campaign has no steps. Add some to make it do something."
                    primaryAction={{
                      label: "Edit campaign",
                      onClick: () => router.push(`/campaigns/${id}/edit`),
                    }}
                  />
                ) : (
                  <ol className="space-y-2">
                    {campaign.steps.map((s) => {
                      const meta = STEP_TYPE_META[s.stepType];
                      const Icon = meta.icon;
                      return (
                        <li
                          key={s.id}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border bg-bg-card"
                        >
                          <div className="h-8 w-8 rounded-md bg-bg-elevated flex items-center justify-center flex-shrink-0">
                            <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={meta.tone} className="text-[10px]">
                                {meta.label}
                              </Badge>
                              <h4 className="text-sm font-medium text-text-primary">
                                {s.name}
                              </h4>
                            </div>
                            {s.subject && (
                              <p className="text-xs text-text-muted mt-1">
                                Subject: {s.subject}
                              </p>
                            )}
                            {s.template && (
                              <p className="text-xs text-text-muted mt-1 line-clamp-3">
                                {s.template}
                              </p>
                            )}
                            {s.stepType === "WAIT" && s.waitHours && (
                              <p className="text-xs text-text-muted mt-1">
                                Wait {s.waitHours} hour{s.waitHours === 1 ? "" : "s"}
                              </p>
                            )}
                            {s.stepType === "WEBHOOK" && s.webhookUrl && (
                              <p className="text-xs text-text-muted mt-1 font-mono">
                                {s.webhookMethod} {s.webhookUrl}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            ),
          },
          {
            id: "enrollments",
            label: `Enrollments (${campaign.enrolledCount})`,
            content: (
              <div>
                <EnrollmentTable
                  rows={enrollments}
                  isLoading={enrollmentsQuery.isLoading}
                  hasMore={enrollmentsPagination.hasMore}
                  cursor={enrollmentsPagination.cursor}
                  onLoadMore={(c) => setEnrollmentsCursor(c)}
                  onUnenroll={handleUnenroll}
                  onChangeStatus={setStatusFilter}
                  statusFilter={statusFilter}
                />
              </div>
            ),
          },
        ]}
        defaultTab="overview"
      />
    </>
  );
}

function MetaCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wide font-medium">
          {label}
        </span>
      </div>
      <p className="text-sm font-semibold text-text-primary mt-1">{value}</p>
      {sublabel && (
        <p className="text-xs text-text-muted mt-0.5 truncate" title={sublabel}>
          {sublabel}
        </p>
      )}
    </Card>
  );
}
