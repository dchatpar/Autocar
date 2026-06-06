"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeadSourceDatum } from "@/types/api";

interface LeadSourceChartProps {
  data: LeadSourceDatum[];
  isLoading?: boolean;
}

const COLORS = [
  "#E8FF47", // accent
  "#3B82F6", // info
  "#22D3A0", // success
  "#A855F7", // ai
  "#F97316", // warning
  "#EF4444", // danger
  "#6B7280", // muted
];

interface TooltipPayloadEntry {
  value: number;
  payload: LeadSourceDatum;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="bg-bg-card border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-text-muted">{entry.payload.source}</p>
      <p className="text-sm font-semibold text-text-primary">{entry.value} leads</p>
    </div>
  );
}

export function LeadSourceChart({ data, isLoading }: LeadSourceChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead Sources</CardTitle>
        <CardDescription>Where your leads are coming from this month</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3 animate-pulse" aria-busy="true">
            <Skeleton height={180} />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={16} />
              ))}
            </div>
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-text-muted py-8 text-center">No lead data yet.</p>
        ) : (
          <div className="h-[260px] w-full" aria-label="Lead source bar chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1E2229" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="source"
                  stroke="#6B7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  stroke="#6B7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#1A1D24" }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
