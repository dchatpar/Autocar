"use client";

/**
 * StatsOverview — headline metrics + 30-day timeline for a campaign.
 *
 * Uses the existing recharts library (already in deps). The
 * timeline is bucketed by day in the backend; we just pass it
 * straight to <LineChart />.
 */

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Users, Activity, CheckCircle2, XCircle, Mail, MessageSquare, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn, formatNumber } from "@/lib/utils";
import type { CampaignStats } from "@/types/api";

interface StatsOverviewProps {
  stats: CampaignStats | undefined;
  isLoading?: boolean;
  days?: number;
}

interface TileProps {
  label: string;
  value: number | string;
  icon: typeof Users;
  tone?: "default" | "warning" | "success" | "danger" | "info";
  sublabel?: string;
}

function Tile({ label, value, icon: Icon, tone = "default", sublabel }: TileProps) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : tone === "info"
            ? "text-info"
            : "text-text-primary";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs uppercase tracking-wide font-medium">
          {label}
        </span>
      </div>
      <p className={cn("text-2xl font-bold mt-1", toneClass)}>
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {sublabel && (
        <p className="text-xs text-text-muted mt-0.5">{sublabel}</p>
      )}
    </Card>
  );
}

export function StatsOverview({ stats, isLoading, days = 30 }: StatsOverviewProps) {
  if (isLoading || !stats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const conversionPct = (stats.conversionRate * 100).toFixed(1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          label="Enrolled"
          value={stats.enrolledCount}
          icon={Users}
          sublabel={`${stats.recentEnrollments} in last ${days}d`}
        />
        <Tile
          label="Active"
          value={stats.activeCount}
          icon={Activity}
          tone="warning"
        />
        <Tile
          label="Completed"
          value={stats.completedCount}
          icon={CheckCircle2}
          tone="success"
          sublabel={`${stats.recentCompletions} in last ${days}d`}
        />
        <Tile
          label="Failed"
          value={stats.failedCount}
          icon={XCircle}
          tone="danger"
          sublabel={`${stats.recentFailures} in last ${days}d`}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          label="Emails sent"
          value={stats.emailsSent}
          icon={Mail}
          tone="info"
        />
        <Tile
          label="SMS sent"
          value={stats.smsSent}
          icon={MessageSquare}
          tone="info"
        />
        <Tile
          label="Conversion"
          value={`${conversionPct}%`}
          icon={TrendingUp}
          tone="success"
        />
        <Tile
          label="Exited"
          value={stats.exitedCount}
          icon={XCircle}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity timeline</CardTitle>
          <CardDescription>
            Enrollments, completions, and failures per day (last {days} days).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimelineChart data={stats.timeline} />
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineChart({
  data,
}: {
  data: CampaignStats["timeline"];
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.date.slice(5), // "MM-DD"
        Enrolled: d.enrolled,
        Completed: d.completed,
        Failed: d.failed,
      })),
    [data],
  );
  const hasData = chartData.some(
    (d) => d.Enrolled > 0 || d.Completed > 0 || d.Failed > 0,
  );

  if (!hasData) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-text-muted">
        No activity in this window yet.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            stroke="rgba(255,255,255,0.4)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="rgba(255,255,255,0.4)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(20,20,20,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#fff",
            }}
            cursor={{ stroke: "rgba(255,255,255,0.1)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Line
            type="monotone"
            dataKey="Enrolled"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="Completed"
            stroke="#10B981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="Failed"
            stroke="#EF4444"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
