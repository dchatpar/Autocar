"use client";

/**
 * LiveActivityFeed — dashboard panel that streams real-time
 * events from the WebSocket. Subscribes to:
 *
 *   - lead:created
 *   - lead:updated
 *   - lead:assigned
 *   - lead:status_changed
 *   - customer:created
 *   - deal:stage_changed
 *   - deal:delivered
 *   - vehicle:sold
 *   - vehicle:price_changed
 *   - testdrive:scheduled
 *   - testdrive:completed
 *
 * The feed keeps the last 50 events in memory and renders the
 * freshest one at the top. A small "live" pulse in the header
 * turns red briefly when an event arrives.
 *
 * Why a separate component from `<ActivityFeed />`?
 *   The existing ActivityFeed is the server-rendered timeline of
 *   persisted ActivityLog rows; this one is the live socket-driven
 *   feed that shows the millisecond an event arrives. We keep
 *   them as siblings so callers can opt into one or both.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Car,
  CheckCircle,
  Handshake,
  Tag,
  TrendingUp,
  UserPlus,
  Users,
  Radio,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useRealtime, useRealtimeEvent } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "@/lib/utils";
import { cn } from "@/lib/utils";

type ActivityKind =
  | "lead_created"
  | "lead_updated"
  | "lead_assigned"
  | "lead_status"
  | "customer_created"
  | "deal_stage"
  | "deal_delivered"
  | "vehicle_sold"
  | "vehicle_price"
  | "testdrive_scheduled"
  | "testdrive_completed";

interface FeedEntry {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  target: string;
  actor: string;
  ts: number;
}

const KIND_META: Record<
  ActivityKind,
  { icon: React.ReactNode; tone: string; label: string }
> = {
  lead_created: { icon: <Users className="h-4 w-4" />, tone: "text-info", label: "New lead" },
  lead_updated: { icon: <Tag className="h-4 w-4" />, tone: "text-text-muted", label: "Lead updated" },
  lead_assigned: { icon: <UserPlus className="h-4 w-4" />, tone: "text-accent", label: "Lead assigned" },
  lead_status: { icon: <TrendingUp className="h-4 w-4" />, tone: "text-accent", label: "Lead moved" },
  customer_created: { icon: <Users className="h-4 w-4" />, tone: "text-info", label: "New customer" },
  deal_stage: { icon: <Handshake className="h-4 w-4" />, tone: "text-accent", label: "Deal stage" },
  deal_delivered: { icon: <CheckCircle className="h-4 w-4" />, tone: "text-success", label: "Deal delivered" },
  vehicle_sold: { icon: <Car className="h-4 w-4" />, tone: "text-success", label: "Vehicle sold" },
  vehicle_price: { icon: <Tag className="h-4 w-4" />, tone: "text-warning", label: "Price changed" },
  testdrive_scheduled: { icon: <Car className="h-4 w-4" />, tone: "text-info", label: "Test drive" },
  testdrive_completed: { icon: <CheckCircle className="h-4 w-4" />, tone: "text-success", label: "Test drive done" },
};

const MAX_ENTRIES = 50;

export function LiveActivityFeed() {
  const { user } = useAuth();
  const { socket, connected, lastEventAt } = useRealtime();
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushEntry(entry: FeedEntry): void {
    setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
  }

  function triggerPulse(): void {
    setPulse(true);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulse(false), 800);
  }

  // ---- Subscriptions -------------------------------------------------

  useRealtimeEvent<{
    lead: { id: string; firstName: string; lastName: string; source?: string | null; currentScore: number };
    createdBy?: { id: string; name?: string | null } | null;
    ts: number;
  }>(socket, "lead:created", ({ lead, createdBy }) => {
    pushEntry({
      id: `${lead.id}:${Date.now()}`,
      kind: "lead_created",
      title: `New lead: ${lead.firstName} ${lead.lastName}`,
      detail: lead.source ? `From ${lead.source} — score ${lead.currentScore}` : `Score ${lead.currentScore}`,
      target: `${lead.firstName} ${lead.lastName}`,
      actor: createdBy?.name ?? user?.name ?? "System",
      ts: Date.now(),
    });
    triggerPulse();
  });

  useRealtimeEvent<{ leadId: string; assignedToId: string | null; assignedById: string; ts: number }>(
    socket,
    "lead:assigned",
    ({ leadId, assignedById }) => {
      pushEntry({
        id: `${leadId}:assigned:${Date.now()}`,
        kind: "lead_assigned",
        title: "Lead assigned",
        detail: `Reassigned by ${assignedById}`,
        target: leadId,
        actor: assignedById,
        ts: Date.now(),
      });
      triggerPulse();
    },
  );

  useRealtimeEvent<{ leadId: string; from: string; to: string; ts: number }>(
    socket,
    "lead:status_changed",
    ({ leadId, from, to }) => {
      pushEntry({
        id: `${leadId}:status:${Date.now()}`,
        kind: "lead_status",
        title: `Lead moved ${from} → ${to}`,
        detail: "Pipeline progression",
        target: leadId,
        actor: user?.name ?? "System",
        ts: Date.now(),
      });
      triggerPulse();
    },
  );

  useRealtimeEvent<{
    customer: { id: string; firstName: string; lastName: string };
    createdBy?: { id: string; name?: string | null } | null;
    ts: number;
  }>(socket, "customer:created", ({ customer, createdBy }) => {
    pushEntry({
      id: `${customer.id}:${Date.now()}`,
      kind: "customer_created",
      title: `New customer: ${customer.firstName} ${customer.lastName}`,
      detail: "Added to CRM",
      target: `${customer.firstName} ${customer.lastName}`,
      actor: createdBy?.name ?? user?.name ?? "System",
      ts: Date.now(),
    });
    triggerPulse();
  });

  useRealtimeEvent<{ dealId: string; from: string; to: string; ts: number }>(
    socket,
    "deal:stage_changed",
    ({ dealId, from, to }) => {
      pushEntry({
        id: `${dealId}:stage:${Date.now()}`,
        kind: "deal_stage",
        title: `Deal ${from} → ${to}`,
        detail: "Stage advanced",
        target: dealId,
        actor: user?.name ?? "System",
        ts: Date.now(),
      });
      triggerPulse();
    },
  );

  useRealtimeEvent<{ dealId: string; vehicleId?: string | null; customerId: string; deliveredAt: string; ts: number }>(
    socket,
    "deal:delivered",
    ({ dealId, customerId }) => {
      pushEntry({
        id: `${dealId}:delivered:${Date.now()}`,
        kind: "deal_delivered",
        title: "Deal delivered",
        detail: `Customer ${customerId} took delivery`,
        target: dealId,
        actor: user?.name ?? "System",
        ts: Date.now(),
      });
      triggerPulse();
    },
  );

  useRealtimeEvent<{ vehicleId: string; vin: string; dealId?: string; ts: number }>(
    socket,
    "vehicle:sold",
    ({ vehicleId, vin }) => {
      pushEntry({
        id: `${vehicleId}:sold:${Date.now()}`,
        kind: "vehicle_sold",
        title: "Vehicle sold",
        detail: `VIN ${vin.slice(-6) || "—"}`,
        target: vehicleId,
        actor: user?.name ?? "System",
        ts: Date.now(),
      });
      triggerPulse();
    },
  );

  useRealtimeEvent<{ vehicleId: string; oldPrice: number | null; newPrice: number | null; ts: number }>(
    socket,
    "vehicle:price_changed",
    ({ vehicleId, oldPrice, newPrice }) => {
      pushEntry({
        id: `${vehicleId}:price:${Date.now()}`,
        kind: "vehicle_price",
        title: "Price updated",
        detail:
          oldPrice !== null && newPrice !== null
            ? `$${oldPrice.toLocaleString()} → $${newPrice.toLocaleString()}`
            : "Pricing refreshed",
        target: vehicleId,
        actor: user?.name ?? "System",
        ts: Date.now(),
      });
      triggerPulse();
    },
  );

  useRealtimeEvent<{
    appointment: { id: string; customerId: string; vehicleId: string; scheduledAt: string; assignedToId?: string | null };
    ts: number;
  }>(socket, "testdrive:scheduled", ({ appointment }) => {
    pushEntry({
      id: `${appointment.id}:scheduled:${Date.now()}`,
      kind: "testdrive_scheduled",
      title: "Test drive scheduled",
      detail: new Date(appointment.scheduledAt).toLocaleString(),
      target: appointment.id,
      actor: user?.name ?? "System",
      ts: Date.now(),
    });
    triggerPulse();
  });

  useRealtimeEvent<{
    appointment: { id: string; customerId: string; vehicleId: string; completedAt: string; sold: boolean };
    ts: number;
  }>(socket, "testdrive:completed", ({ appointment }) => {
    pushEntry({
      id: `${appointment.id}:completed:${Date.now()}`,
      kind: "testdrive_completed",
      title: appointment.sold ? "Test drive → SALE" : "Test drive done",
      detail: appointment.sold ? "Customer bought after the drive" : "Marked complete",
      target: appointment.id,
      actor: user?.name ?? "System",
      ts: Date.now(),
    });
    triggerPulse();
  });

  // Cleanup pulse timer.
  useEffect(() => {
    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, []);

  const subtitle = useMemo(() => {
    if (!connected) return "Connecting…";
    if (lastEventAt) {
      const ms = Date.now() - lastEventAt;
      if (ms < 2_000) return "Live";
    }
    return "Live";
  }, [connected, lastEventAt]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Live activity</CardTitle>
          <CardDescription>Real-time event stream</CardDescription>
        </div>
        <div className="flex items-center gap-1.5">
          <Radio
            className={cn(
              "h-3.5 w-3.5 transition-colors",
              pulse ? "text-danger animate-pulse" : connected ? "text-success" : "text-text-muted",
            )}
            aria-hidden="true"
          />
          <span className="text-xs text-text-muted">{subtitle}</span>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="py-8 text-center text-text-muted text-sm">
            {connected
              ? "Listening for activity… events will appear here as they happen."
              : "Connecting to live feed…"}
          </div>
        ) : (
          <ul className="space-y-3" role="feed" aria-label="Live activity feed">
            {entries.map((e) => {
              const meta = KIND_META[e.kind];
              return (
                <li
                  key={e.id}
                  className="flex items-start gap-3 py-1.5 border-b border-border/50 last:border-b-0"
                  role="article"
                >
                  <div className={cn("mt-0.5 flex-shrink-0", meta.tone)} aria-hidden="true">
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">
                      {e.title}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5 line-clamp-1">
                      {e.detail}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-text-muted">
                      <span>{e.actor}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={new Date(e.ts).toISOString()}>
                        {formatDistanceToNow(new Date(e.ts))}
                      </time>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default LiveActivityFeed;
