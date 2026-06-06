"use client";

/**
 * ScoreHistoryChart — line chart of a lead's score over time.
 *
 * Used on the lead detail page. Pulls from GET /leads/:id/score/history
 * via the useLeadScoring hook.
 *
 * Renders:
 *   - A recharts line chart of score vs. scoredAt
 *   - The latest classification + score as the headline
 *   - A small legend for the three classification bands (background)
 */

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBadge, type Classification } from "./ScoreBadge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface ScoreHistoryPoint {
  id: string;
  score: number;
  classification: Classification;
  scoredAt: string; // ISO 8601
}

export interface ScoreHistoryChartProps {
  data: ReadonlyArray<ScoreHistoryPoint>;
  isLoading?: boolean;
  currentScore?: number;
  currentClassification?: Classification;
}

const COLD_COLOR = "#EF4444";
const WARM_COLOR = "#F97316";
const HOT_COLOR = "#22D3A0";

function classify(score: number): Classification {
  if (score <= 30) return "cold";
  if (score <= 60) return "warm";
  return "hot";
}

function pointColor(score: number): string {
  const c = classify(score);
  if (c === "cold") return COLD_COLOR;
  if (c === "warm") return WARM_COLOR;
  return HOT_COLOR;
}

interface ChartDatum {
  id: string;
  score: number;
  classification: Classification;
  scoredAt: string;
  scoredAtLabel: string;
  color: string;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatTooltipDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface CustomTooltipPayloadEntry {
  value?: number | string;
  payload?: ChartDatum;
}

function CustomTooltip(props: TooltipProps<number, string> & {
  payload?: CustomTooltipPayloadEntry[];
  active?: boolean;
  label?: string | number;
}) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  if (!entry || !entry.payload) return null;
  const datum = entry.payload;
  return (
    <div className="bg-bg-card border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-[10px] uppercase tracking-wider text-text-muted">
        {formatTooltipDate(datum.scoredAt)}
      </p>
      <div className="flex items-center gap-2 mt-0.5">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: datum.color }}
          aria-hidden="true"
        />
        <span className="text-sm font-semibold text-text-primary tabular-nums">
          {datum.score}
        </span>
        <span className="text-xs text-text-muted">/ 100</span>
      </div>
    </div>
  );
}

export function ScoreHistoryChart({
  data,
  isLoading,
  currentScore,
  currentClassification,
}: ScoreHistoryChartProps) {
  const chartData = useMemo<ChartDatum[]>(() => {
    if (!data) return [];
    return [...data]
      .sort((a, b) => new Date(a.scoredAt).getTime() - new Date(b.scoredAt).getTime())
      .map((p) => ({
        id: p.id,
        score: p.score,
        classification: p.classification,
        scoredAt: p.scoredAt,
        scoredAtLabel: formatDateLabel(p.scoredAt),
        color: pointColor(p.score),
      }));
  }, [data]);

  const trend = useMemo(() => {
    if (chartData.length < 2) return "flat" as const;
    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    if (!first || !last) return "flat" as const;
    if (last.score > first.score) return "up" as const;
    if (last.score < first.score) return "down" as const;
    return "flat" as const;
  }, [chartData]);

  const latest = chartData[chartData.length - 1];
  const headlineScore = currentScore ?? latest?.score ?? 0;
  const headlineClassification: Classification =
    currentClassification ?? latest?.classification ?? classify(headlineScore);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Lead score history</CardTitle>
            <CardDescription>
              Last {chartData.length} recompute{chartData.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <TrendIndicator trend={trend} />
            <ScoreBadge
              score={headlineScore}
              classification={headlineClassification}
              size="md"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton height={220} className="w-full" />
        ) : chartData.length === 0 ? (
          <p className="text-sm text-text-muted py-10 text-center">
            No score history yet — recompute the score to start tracking.
          </p>
        ) : chartData.length === 1 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <ScoreBadge
              score={chartData[0]?.score ?? 0}
              classification={chartData[0]?.classification}
              size="md"
            />
            <p className="text-xs text-text-muted">
              Single sample at {formatTooltipDate(chartData[0]?.scoredAt ?? "")}
            </p>
          </div>
        ) : (
          <div
            className="h-[240px] w-full"
            aria-label="Lead score history line chart"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="#1E2229" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="scoredAtLabel"
                  stroke="#6B7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#6B7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  ticks={[0, 30, 60, 100]}
                />
                {/* Classification bands as background tint */}
                <ReferenceArea
                  y1={0}
                  y2={30}
                  fill={COLD_COLOR}
                  fillOpacity={0.04}
                  strokeOpacity={0}
                />
                <ReferenceArea
                  y1={31}
                  y2={60}
                  fill={WARM_COLOR}
                  fillOpacity={0.04}
                  strokeOpacity={0}
                />
                <ReferenceArea
                  y1={61}
                  y2={100}
                  fill={HOT_COLOR}
                  fillOpacity={0.04}
                  strokeOpacity={0}
                />
                {/* Boundary reference lines */}
                <ReferenceLine
                  y={30}
                  stroke={COLD_COLOR}
                  strokeDasharray="2 4"
                  strokeOpacity={0.4}
                />
                <ReferenceLine
                  y={60}
                  stroke={WARM_COLOR}
                  strokeDasharray="2 4"
                  strokeOpacity={0.4}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#2A2F3A" }} />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#E8FF47"
                  strokeWidth={2.5}
                  dot={(dotProps: unknown) => {
                    const { cx, cy, payload } = dotProps as {
                      cx?: number;
                      cy?: number;
                      payload?: ChartDatum;
                    };
                    if (cx === undefined || cy === undefined || !payload) return <g />;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={payload.color}
                        stroke="#0A0C0F"
                        strokeWidth={2}
                      />
                    );
                  }}
                  activeDot={(dotProps: unknown) => {
                    const { cx, cy, payload } = dotProps as {
                      cx?: number;
                      cy?: number;
                      payload?: ChartDatum;
                    };
                    if (cx === undefined || cy === undefined || !payload) return <g />;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={payload.color}
                        stroke="#0A0C0F"
                        strokeWidth={2}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendIndicator({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#22D3A0] font-medium">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        Trending up
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#EF4444] font-medium">
        <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
        Trending down
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-text-muted font-medium">
      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      Steady
    </span>
  );
}
