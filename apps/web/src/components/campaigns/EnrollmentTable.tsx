"use client";

/**
 * EnrollmentTable — paginated table of CampaignEnrollment rows.
 *
 * Used on the campaign detail page. Columns:
 *   - Subject (name + email/phone)
 *   - Status badge
 *   - Current step
 *   - Steps executed / failed
 *   - Last error
 *   - Enrolled at
 *   - Actions (unenroll)
 */

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuLegacy } from "@/components/ui/dropdown-menu";
import { MoreVertical, XCircle, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Activity, Clock, Pause } from "lucide-react";
import { formatDistanceToNow, formatDate, cn } from "@/lib/utils";
import type { CampaignEnrollment, CampaignEnrollmentStatus } from "@/types/api";

interface EnrollmentTableProps {
  rows: CampaignEnrollment[];
  isLoading?: boolean;
  hasMore: boolean;
  cursor: string | null;
  onLoadMore?: (cursor: string) => void;
  onUnenroll?: (enrollmentId: string) => Promise<void> | void;
  onChangeStatus?: (status: CampaignEnrollmentStatus | "all") => void;
  statusFilter: CampaignEnrollmentStatus | "all";
}

const STATUS_BADGE: Record<
  CampaignEnrollmentStatus,
  { variant: "info" | "muted" | "warning" | "success" | "danger" | "accent"; label: string; icon: typeof Activity }
> = {
  PENDING: { variant: "muted", label: "Pending", icon: Clock },
  ACTIVE: { variant: "info", label: "Active", icon: Activity },
  PAUSED: { variant: "warning", label: "Paused", icon: Pause },
  COMPLETED: { variant: "success", label: "Completed", icon: CheckCircle2 },
  EXITED: { variant: "muted", label: "Exited", icon: XCircle },
  FAILED: { variant: "danger", label: "Failed", icon: AlertCircle },
};

const STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: CampaignEnrollmentStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING", label: "Pending" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "EXITED", label: "Exited" },
  { value: "FAILED", label: "Failed" },
];

export function EnrollmentTable({
  rows,
  isLoading,
  hasMore,
  cursor,
  onLoadMore,
  onUnenroll,
  onChangeStatus,
  statusFilter,
}: EnrollmentTableProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleUnenroll = async (id: string) => {
    if (!onUnenroll) return;
    if (!window.confirm("Unenroll this record from the campaign?")) return;
    setBusyId(id);
    try {
      await onUnenroll(id);
    } finally {
      setBusyId(null);
    }
  };

  const totalCount = rows.length;
  const showLoading = isLoading && totalCount === 0;
  const showEmpty = !isLoading && totalCount === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {totalCount.toLocaleString()} enrollment{totalCount === 1 ? "" : "s"}
          {hasMore ? " (more available)" : ""}
        </p>
        {onChangeStatus && (
          <select
            value={statusFilter}
            onChange={(e) => onChangeStatus(e.target.value as CampaignEnrollmentStatus | "all")}
            className="h-8 px-2 rounded-md border border-border bg-bg-elevated text-sm text-text-primary"
            aria-label="Filter by enrollment status"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>Status</TableHead>
            <TableHead align="center">Step</TableHead>
            <TableHead align="center">Sent</TableHead>
            <TableHead>Last error</TableHead>
            <TableHead>Enrolled</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {showLoading && <TableLoading colSpan={7} rows={5} />}
          {showEmpty && (
            <TableEmpty
              colSpan={7}
              message="No enrollments match this filter yet."
            />
          )}
          {!showLoading &&
            !showEmpty &&
            rows.map((e) => {
              const status = STATUS_BADGE[e.status];
              const StatusIcon = status.icon;
              const isBusy = busyId === e.id;
              return (
                <TableRow key={e.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-text-primary">
                        {e.subjectName ?? "Unknown"}
                      </p>
                      <p className="text-xs text-text-muted">
                        {[e.subjectEmail, e.subjectPhone]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant} className="text-[10px]">
                      <StatusIcon className="h-3 w-3 mr-1" aria-hidden="true" />
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell align="center">
                    <span className="font-mono text-xs text-text-muted">
                      {e.currentStepOrder + 1}
                    </span>
                  </TableCell>
                  <TableCell align="center">
                    <div className="flex items-center justify-center gap-2 text-xs">
                      {e.emailsSent > 0 && (
                        <span className="text-info">
                          {e.emailsSent} email{e.emailsSent === 1 ? "" : "s"}
                        </span>
                      )}
                      {e.smsSent > 0 && (
                        <span className="text-success">
                          {e.smsSent} SMS
                        </span>
                      )}
                      {e.emailsSent === 0 && e.smsSent === 0 && (
                        <span className="text-text-muted">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {e.lastError ? (
                      <span
                        className="text-xs text-danger line-clamp-2 max-w-[260px]"
                        title={e.lastError}
                      >
                        {e.lastError}
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-xs text-text-muted">
                        {formatDistanceToNow(e.enrolledAt)} ago
                      </p>
                      <p className="text-[10px] text-text-muted">
                        {formatDate(e.enrolledAt, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell align="right">
                    {onUnenroll &&
                      ["PENDING", "ACTIVE", "PAUSED"].includes(e.status) && (
                        <DropdownMenuLegacy
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isBusy}
                              aria-label="Enrollment actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          }
                          items={[
                            {
                              id: "unenroll",
                              label: "Unenroll",
                              icon: <XCircle className="h-4 w-4" />,
                              onClick: () => handleUnenroll(e.id),
                              danger: true,
                            },
                          ]}
                        />
                      )}
                  </TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>

      {hasMore && onLoadMore && (
        <div className="flex items-center justify-center pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => cursor && onLoadMore(cursor)}
            disabled={!cursor || isLoading}
            aria-label="Load more enrollments"
          >
            <ChevronRight className="h-3.5 w-3.5" />
            <span>Load more</span>
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function useEnrollmentStatusFilter(
  initial: CampaignEnrollmentStatus | "all" = "all",
): [CampaignEnrollmentStatus | "all", (v: CampaignEnrollmentStatus | "all") => void] {
  const [v, setV] = useState<CampaignEnrollmentStatus | "all">(initial);
  return [v, setV];
}
