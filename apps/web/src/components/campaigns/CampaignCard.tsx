"use client";

/**
 * CampaignCard — single-row card for the campaigns list page.
 *
 * Shows: name, status badge, trigger, enrolled/active/completed counts,
 * and a footer with created-at and quick actions.
 */

import Link from "next/link";
import {
  Mail,
  MessageSquare,
  Calendar,
  Users,
  CheckCircle2,
  Archive,
  Pause,
  Play,
  Zap,
  UserCheck,
  Activity,
  Trophy,
  BarChart3,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatDistanceToNow } from "@/lib/utils";
import type {
  CampaignStatus,
  CampaignSummary,
  CampaignTriggerType,
} from "@/types/api";

interface CampaignCardProps {
  campaign: CampaignSummary;
  onActivate?: (id: string) => void;
  onPause?: (id: string) => void;
  onArchive?: (id: string) => void;
  busy?: boolean;
}

const STATUS_BADGE: Record<CampaignStatus, { variant: "info" | "muted" | "warning" | "success" | "danger"; label: string }> = {
  DRAFT: { variant: "muted", label: "Draft" },
  ACTIVE: { variant: "success", label: "Active" },
  PAUSED: { variant: "warning", label: "Paused" },
  ARCHIVED: { variant: "danger", label: "Archived" },
};

const TRIGGER_META: Record<CampaignTriggerType, { label: string; icon: LucideIcon }> = {
  LEAD_CREATED: { label: "New lead", icon: UserCheck },
  LEAD_UPDATED: { label: "Lead updated", icon: Activity },
  STATUS_CHANGE: { label: "Status change", icon: BarChart3 },
  NO_ACTIVITY: { label: "No activity (14d)", icon: Activity },
  DEAL_STAGE: { label: "Deal stage", icon: Trophy },
  APPOINTMENT: { label: "Appointment", icon: Calendar },
  SCORE_CHANGE: { label: "Score change", icon: Zap },
  BIRTHDAY: { label: "Birthday", icon: Calendar },
  VEHICLE_MATCH: { label: "Vehicle match", icon: Tag },
  MANUAL: { label: "Manual", icon: Users },
  API: { label: "API", icon: Zap },
};

export function CampaignCard({
  campaign,
  onActivate,
  onPause,
  onArchive,
  busy,
}: CampaignCardProps) {
  const status = STATUS_BADGE[campaign.status];
  const trigger = TRIGGER_META[campaign.triggerType] ?? TRIGGER_META.MANUAL;
  const TriggerIcon = trigger.icon;
  const conversionPct =
    campaign.enrolledCount > 0
      ? Math.round((campaign.completedCount / campaign.enrolledCount) * 100)
      : 0;

  return (
    <Card
      className={cn(
        "p-5 flex flex-col gap-4 transition-shadow hover:shadow-md",
        campaign.status === "ARCHIVED" && "opacity-70",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/campaigns/${campaign.id}`}
            className="block group"
            aria-label={`Open campaign ${campaign.name}`}
          >
            <h3 className="text-base font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
              {campaign.name}
            </h3>
          </Link>
          {campaign.description && (
            <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
              {campaign.description}
            </p>
          )}
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {/* Trigger + step count */}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-elevated border border-border">
          <TriggerIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{trigger.label}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{campaign.stepCount} steps</span>
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Enrolled"
          value={campaign.enrolledCount}
          icon={Users}
        />
        <StatTile
          label="Active"
          value={campaign.activeCount}
          icon={Activity}
          tone="warning"
        />
        <StatTile
          label="Completed"
          value={campaign.completedCount}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-xs text-text-muted">
          Updated {formatDistanceToNow(campaign.updatedAt)} ago
        </span>
        <div className="flex items-center gap-1.5">
          {conversionPct > 0 && (
            <Badge variant="info" className="text-[10px]">
              {conversionPct}% conversion
            </Badge>
          )}
          {campaign.status === "DRAFT" && onActivate && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => onActivate(campaign.id)}
              disabled={busy}
              aria-label="Activate campaign"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Activate</span>
            </Button>
          )}
          {campaign.status === "ACTIVE" && onPause && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onPause(campaign.id)}
              disabled={busy}
              aria-label="Pause campaign"
            >
              <Pause className="h-3.5 w-3.5" />
              <span>Pause</span>
            </Button>
          )}
          {campaign.status === "PAUSED" && onActivate && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => onActivate(campaign.id)}
              disabled={busy}
              aria-label="Resume campaign"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Resume</span>
            </Button>
          )}
          {(campaign.status === "ACTIVE" ||
            campaign.status === "PAUSED" ||
            campaign.status === "DRAFT") &&
            onArchive && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onArchive(campaign.id)}
                disabled={busy}
                aria-label="Archive campaign"
                className="text-text-muted hover:text-danger"
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
            )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Internal — small stat tile                                         */
/* ------------------------------------------------------------------ */

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-text-primary";
  return (
    <div className="rounded-lg border border-border bg-bg-elevated/40 p-2.5">
      <div className="flex items-center gap-1.5 text-text-muted">
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wide font-medium">
          {label}
        </span>
      </div>
      <p className={cn("text-lg font-semibold mt-0.5", toneClass)}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Re-exports for convenience                                         */
/* ------------------------------------------------------------------ */

export { Mail, MessageSquare };
