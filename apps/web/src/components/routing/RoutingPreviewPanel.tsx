"use client";

/**
 * RoutingPreviewPanel — "When a Meta Lead Ad comes in from campaign X,
 * it routes to {repName}."
 *
 * Lets the user pick a source + a vehicle context, calls
 * POST /routing/preview, and shows the decision.
 */

import { useState } from "react";
import { Sparkles, Loader2, AlertCircle, ArrowRight, Clock } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  useRoutingConfig,
  useRoutingPreview,
} from "@/hooks/useRoutingConfig";
import { LEAD_SOURCES_FOR_ROUTING, ROUTING_STRATEGY_LABEL } from "@/types/routing";

const SAMPLE_SOURCES = LEAD_SOURCES_FOR_ROUTING.map((s) => ({
  value: s.key,
  label: s.label,
}));

export function RoutingPreviewPanel() {
  const { data: config } = useRoutingConfig();
  const preview = useRoutingPreview();
  const [source, setSource] = useState<string>("meta_lead_ad");
  const [vehicle, setVehicle] = useState<string>("2024 Honda CR-V");
  const [score, setScore] = useState<string>("65");

  function runPreview() {
    const numeric = Number(score);
    preview.mutate({
      source,
      vehicleInterest: vehicle.trim() || null,
      score: Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 50,
    });
  }

  const result = preview.data;
  const strategyLabel = result
    ? ROUTING_STRATEGY_LABEL[result.strategy] ?? result.strategy
    : null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Simulate an incoming lead
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_120px_auto] gap-2">
          <Select
            options={SAMPLE_SOURCES}
            value={source}
            onChange={setSource}
            aria-label="Source"
          />
          <Input
            placeholder="Vehicle of interest"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            aria-label="Vehicle of interest"
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            aria-label="Lead score 0–100"
          />
          <Button
            type="button"
            variant="primary"
            onClick={runPreview}
            disabled={preview.isPending}
          >
            {preview.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Preview
          </Button>
        </div>
        <p className="text-xs text-text-muted">
          Runs the router with a fake lead — nothing is saved.
        </p>
      </div>

      <div className="border-t border-border pt-4">
        {preview.isError ? (
          <div className="flex items-start gap-2 text-sm text-danger" role="alert">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Couldn't run preview — is the API online?</span>
          </div>
        ) : preview.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton height={20} width="40%" />
            <Skeleton height={40} />
          </div>
        ) : result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent">{strategyLabel}</Badge>
              <span className="text-xs text-text-muted inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {result.responseTimeMs}ms
              </span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-elevated border border-border">
              <ArrowRight className="h-4 w-4 text-accent shrink-0" aria-hidden="true" />
              {result.assignedTo ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={result.assignedToName ?? "?"} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {result.assignedToName ?? "Unknown rep"}
                    </p>
                    <p className="text-xs text-text-muted">{result.reason}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-danger">{result.reason}</p>
              )}
            </div>
            {result.alternativeReps.length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-1">Backup reps</p>
                <ul className="space-y-1" role="list">
                  {result.alternativeReps.map((alt) => (
                    <li
                      key={alt.id}
                      className="flex items-center gap-2 text-sm text-text-muted"
                    >
                      <Avatar name={alt.name ?? "?"} size="sm" />
                      <span>{alt.name ?? "Unknown"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <details className="text-xs text-text-muted">
              <summary className="cursor-pointer hover:text-text-primary">
                Candidate pool ({result.candidateReps.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {result.candidateReps.map((c) => (
                  <li key={c.id} className="flex justify-between">
                    <span>{c.name}</span>
                    {typeof c.load === "number" && (
                      <span>{c.load} open</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            {config
              ? `Current strategy: ${ROUTING_STRATEGY_LABEL[config.strategy]}. Click Preview to see who gets the next ${source} lead.`
              : "Click Preview to test your routing."}
          </p>
        )}
      </div>
    </div>
  );
}
