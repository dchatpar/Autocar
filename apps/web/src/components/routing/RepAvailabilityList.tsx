"use client";

/**
 * RepAvailabilityList — per-rep Available / Away / Off-Duty toggle.
 *
 * Reads reps from /routing/reps. Calls the PATCH mutation with the
 * new rep_availability map. Optimistic update for snappy UX.
 */

import { useMemo } from "react";
import { Circle, CircleDot, CircleSlash, UserCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  useRepsWithAvailability,
  useUpdateRepAvailability,
  useRoutingConfig,
} from "@/hooks/useRoutingConfig";
import { cn } from "@/lib/utils";
import {
  REP_AVAILABILITY_LABEL,
  type RepAvailability,
  type RepWithAvailability,
} from "@/types/routing";

const OPTIONS: Array<{
  value: RepAvailability;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
}> = [
  { value: "AVAILABLE", label: "Available", icon: CircleDot, activeClass: "text-success" },
  { value: "AWAY", label: "Away", icon: Circle, activeClass: "text-warning" },
  { value: "OFF_DUTY", label: "Off-Duty", icon: CircleSlash, activeClass: "text-text-muted" },
];

export function RepAvailabilityList() {
  const { data: reps, isLoading } = useRepsWithAvailability();
  const { data: config } = useRoutingConfig();
  const update = useUpdateRepAvailability();

  const availabilityById = useMemo(() => {
    const map: Record<string, RepAvailability> = {};
    if (config?.rep_availability) {
      for (const [k, v] of Object.entries(config.rep_availability)) {
        map[k] = v;
      }
    }
    return map;
  }, [config]);

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={64} />
        ))}
      </div>
    );
  }

  if (!reps || reps.length === 0) {
    return (
      <div className="text-sm text-text-muted text-center py-8">
        No sales reps yet. Invite team members to start routing leads.
      </div>
    );
  }

  return (
    <ul className="space-y-2" role="list">
      {reps.map((rep) => {
        const current = availabilityById[rep.id] ?? rep.availability;
        return (
          <li
            key={rep.id}
            className="flex items-center justify-between gap-3 p-3 rounded-lg bg-bg-elevated border border-border"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar
                name={rep.name}
                size="md"
                status={current === "AVAILABLE" ? "online" : "offline"}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {rep.name}
                </p>
                <p className="text-xs text-text-muted truncate">
                  {rep.email} · {rep.role}
                  {rep.load > 0 && (
                    <>
                      {" "}
                      · <span className="text-text-primary">{rep.load}</span> open
                    </>
                  )}
                </p>
              </div>
            </div>
            <div
              role="group"
              aria-label={`Availability for ${rep.name}`}
              className="inline-flex rounded-lg border border-border bg-bg-card p-0.5 shrink-0"
            >
              {OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = current === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({ repId: rep.id, availability: opt.value })
                    }
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium transition-colors",
                      active
                        ? cn("bg-bg-primary", opt.activeClass)
                        : "text-text-muted hover:text-text-primary",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
      {update.isPending && (
        <li className="text-xs text-text-muted text-center" aria-live="polite">
          Saving availability…
        </li>
      )}
      {update.isError && (
        <li className="text-xs text-danger text-center" role="alert">
          Couldn't save — check your connection.
        </li>
      )}
    </ul>
  );
}

interface RepBadgeProps {
  rep: RepWithAvailability;
}

export function RepLoadBadge({ rep }: RepBadgeProps) {
  if (rep.load === 0) {
    return (
      <Badge variant="muted">
        <UserCheck className="h-3 w-3 mr-1" /> Free
      </Badge>
    );
  }
  return <Badge variant="warning">{rep.load} open</Badge>;
}
