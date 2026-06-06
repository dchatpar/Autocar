"use client";

import { Users, Car, Handshake, DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { DashboardKpi, KpiIcon, KpiTone } from "@/types/api";
import { cn } from "@/lib/utils";

const ICONS: Record<KpiIcon, React.ReactNode> = {
  users: <Users className="h-5 w-5" />,
  car: <Car className="h-5 w-5" />,
  handshake: <Handshake className="h-5 w-5" />,
  dollar: <DollarSign className="h-5 w-5" />,
  trending: <TrendingUp className="h-5 w-5" />,
};

const TONE_TEXT: Record<KpiTone, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  accent: "text-accent",
};

const TONE_BG: Record<KpiTone, string> = {
  info: "bg-info/10",
  success: "bg-success/10",
  warning: "bg-warning/10",
  danger: "bg-danger/10",
  accent: "bg-accent/10",
};

interface KpiCardProps {
  kpi: DashboardKpi;
  isLoading?: boolean;
}

function formatValue(value: number, format?: DashboardKpi["format"]): string {
  if (format === "currency") return formatCurrency(value);
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (value >= 1000) return value.toLocaleString("en-US");
  return value.toString();
}

export function KpiCard({ kpi, isLoading }: KpiCardProps) {
  if (isLoading) {
    return (
      <Card>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-bg-elevated rounded w-1/2" />
          <div className="h-7 bg-bg-elevated rounded w-3/4" />
          <div className="h-3 bg-bg-elevated rounded w-1/3" />
        </div>
      </Card>
    );
  }

  const positive = kpi.change >= 0;
  return (
    <Card variant="hover" className="min-h-[112px]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-muted">{kpi.label}</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            {formatValue(kpi.value, kpi.format)}
          </p>
          <div
            className={cn(
              "mt-2 inline-flex items-center gap-1 text-xs font-medium",
              positive ? "text-success" : "text-danger",
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
            )}
            <span>
              {positive ? "+" : ""}
              {kpi.change.toFixed(1)}
              {kpi.format === "percent" ? "pp" : "%"}
            </span>
            <span className="text-text-muted ml-1">vs last month</span>
          </div>
        </div>
        <div
          className={cn("p-2 rounded-lg", TONE_BG[kpi.tone], TONE_TEXT[kpi.tone])}
          aria-hidden="true"
        >
          {ICONS[kpi.icon]}
        </div>
      </div>
    </Card>
  );
}
