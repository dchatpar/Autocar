"use client";

/**
 * LiveKpiCards — dashboard KPI strip that auto-updates from the
 * server's `stats:update` broadcast.
 *
 * Cards:
 *   - Active leads
 *   - Hot leads
 *   - Open deals
 *   - Vehicles available
 *
 * Each card pulses subtly when its value changes, with a brief
 * green ring to draw the eye without being noisy. A "Live" badge
 * in the corner indicates the WebSocket is connected.
 *
 * The component is intentionally self-contained — no global store,
 * no useEffect on every render. The first event seeds the cards;
 * subsequent events merge in the keys we know about.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Car,
  Handshake,
  Radio,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useRealtime, useRealtimeEvent } from "@/hooks/useRealtime";
import { cn } from "@/lib/utils";

interface LiveKpis {
  activeLeads: number;
  hotLeads: number;
  newLeadsToday: number;
  openDeals: number;
  dealsDelivered: number;
  vehiclesAvailable: number;
  vehiclesSold: number;
  testDrivesScheduled: number;
  testDrivesCompleted: number;
  unreadNotifications: number;
  computedAt?: string;
}

const DEFAULT_KPIS: LiveKpis = {
  activeLeads: 0,
  hotLeads: 0,
  newLeadsToday: 0,
  openDeals: 0,
  dealsDelivered: 0,
  vehiclesAvailable: 0,
  vehiclesSold: 0,
  testDrivesScheduled: 0,
  testDrivesCompleted: 0,
  unreadNotifications: 0,
};

function numberOrZero(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function LiveKpiCards() {
  const { socket, connected, lastEventAt } = useRealtime();
  const [kpis, setKpis] = useState<LiveKpis>(DEFAULT_KPIS);
  const [pulseKeys, setPulseKeys] = useState<Record<keyof LiveKpis, number>>({
    activeLeads: 0,
    hotLeads: 0,
    newLeadsToday: 0,
    openDeals: 0,
    dealsDelivered: 0,
    vehiclesAvailable: 0,
    vehiclesSold: 0,
    testDrivesScheduled: 0,
    testDrivesCompleted: 0,
    unreadNotifications: 0,
    computedAt: 0,
  });
  const prevRef = useRef<LiveKpis>(DEFAULT_KPIS);

  useRealtimeEvent<Record<string, unknown>>(socket, "stats:update", (payload) => {
    const next: LiveKpis = {
      activeLeads: numberOrZero(payload["activeLeads"]),
      hotLeads: numberOrZero(payload["hotLeads"]),
      newLeadsToday: numberOrZero(payload["newLeadsToday"]),
      openDeals: numberOrZero(payload["openDeals"]),
      dealsDelivered: numberOrZero(payload["dealsDelivered"]),
      vehiclesAvailable: numberOrZero(payload["vehiclesAvailable"]),
      vehiclesSold: numberOrZero(payload["vehiclesSold"]),
      testDrivesScheduled: numberOrZero(payload["testDrivesScheduled"]),
      testDrivesCompleted: numberOrZero(payload["testDrivesCompleted"]),
      unreadNotifications: numberOrZero(payload["unreadNotifications"]),
      computedAt:
        typeof payload["computedAt"] === "string"
          ? (payload["computedAt"] as string)
          : undefined,
    };

    // Compute pulse triggers: any key whose value changed.
    const prev = prevRef.current;
    const pulses: Record<keyof LiveKpis, number> = { ...pulseKeys };
    (Object.keys(next) as Array<keyof LiveKpis>).forEach((k) => {
      if (k === "computedAt") return;
      if (next[k] !== prev[k]) {
        pulses[k] = Date.now();
      }
    });
    prevRef.current = next;
    setKpis(next);
    setPulseKeys(pulses);
  });

  // Auto-decay the pulse flag so the green ring fades.
  useEffect(() => {
    const handle = setInterval(() => {
      setPulseKeys((prev) => {
        const next = { ...prev };
        const now = Date.now();
        for (const k of Object.keys(next) as Array<keyof LiveKpis>) {
          if (next[k] && now - next[k] > 1500) {
            next[k] = 0;
          }
        }
        return next;
      });
    }, 500);
    return () => clearInterval(handle);
  }, []);

  const computedAgo = useMemo(() => {
    if (!kpis.computedAt) return null;
    const ms = Date.now() - new Date(kpis.computedAt).getTime();
    if (ms < 0) return "just now";
    if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
    return `${Math.floor(ms / 60_000)}m ago`;
  }, [kpis.computedAt, lastEventAt]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-medium text-text-muted">Live KPIs</h2>
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <Radio
            className={cn(
              "h-3 w-3",
              connected ? "text-success" : "text-text-muted",
            )}
            aria-hidden="true"
          />
          <span>{connected ? "Live" : "Offline"}</span>
          {computedAgo && <span aria-hidden="true">·</span>}
          {computedAgo && <span>updated {computedAgo}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile
          label="Active leads"
          value={kpis.activeLeads}
          icon={<Users className="h-4 w-4" />}
          tone="text-info"
          pulse={pulseKeys.activeLeads}
        />
        <KpiTile
          label="Hot leads"
          value={kpis.hotLeads}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="text-danger"
          pulse={pulseKeys.hotLeads}
        />
        <KpiTile
          label="Open deals"
          value={kpis.openDeals}
          icon={<Handshake className="h-4 w-4" />}
          tone="text-accent"
          pulse={pulseKeys.openDeals}
        />
        <KpiTile
          label="Vehicles in stock"
          value={kpis.vehiclesAvailable}
          icon={<Car className="h-4 w-4" />}
          tone="text-success"
          pulse={pulseKeys.vehiclesAvailable}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Single tile                                                        */
/* ------------------------------------------------------------------ */

interface KpiTileProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
  pulse: number;
}

function KpiTile({ label, value, icon, tone, pulse }: KpiTileProps) {
  const active = pulse > 0;
  return (
    <Card
      className={cn(
        "p-3 transition-shadow",
        active && "ring-1 ring-success/60 shadow-md shadow-success/10",
      )}
      data-pulse={active ? "1" : "0"}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">{label}</p>
        <span className={cn("p-1.5 rounded-md bg-bg-elevated", tone)} aria-hidden="true">
          {icon}
        </span>
      </div>
      <p
        className={cn(
          "text-2xl font-semibold text-text-primary mt-2 tabular-nums transition-colors",
          active && "text-success",
        )}
      >
        {value.toLocaleString("en-US")}
      </p>
    </Card>
  );
}

export default LiveKpiCards;
