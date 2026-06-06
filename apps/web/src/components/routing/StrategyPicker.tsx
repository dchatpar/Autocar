"use client";

/**
 * StrategyPicker — radio cards for choosing a routing strategy.
 *
 * The six strategies live in `types/routing.ts`; this component renders
 * them as accessible, dark-mode radio cards with short descriptions.
 */

import { Repeat, Scale, Tag, Map, Car, Sparkles } from "lucide-react";
import {
  ROUTING_STRATEGY_LABEL,
  ROUTING_STRATEGY_DESCRIPTION,
  type RoutingStrategy,
} from "@/types/routing";
import { cn } from "@/lib/utils";

const ICON: Record<RoutingStrategy, React.ComponentType<{ className?: string }>> = {
  ROUND_ROBIN: Repeat,
  LOAD_BALANCED: Scale,
  SOURCE_BASED: Tag,
  GEOGRAPHIC: Map,
  VEHICLE_MATCH: Car,
  AI_SCORED: Sparkles,
};

const STRATEGY_ORDER: RoutingStrategy[] = [
  "ROUND_ROBIN",
  "LOAD_BALANCED",
  "SOURCE_BASED",
  "GEOGRAPHIC",
  "VEHICLE_MATCH",
  "AI_SCORED",
];

export interface StrategyPickerProps {
  value: RoutingStrategy;
  onChange: (next: RoutingStrategy) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function StrategyPicker({
  value,
  onChange,
  disabled = false,
  ariaLabel = "Routing strategy",
}: StrategyPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {STRATEGY_ORDER.map((s) => {
        const Icon = ICON[s];
        const selected = value === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(s)}
            className={cn(
              "text-left p-4 rounded-xl border transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              selected
                ? "bg-bg-elevated border-accent"
                : "bg-bg-card border-border hover:border-border-active",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                  selected
                    ? "bg-accent text-bg-primary"
                    : "bg-bg-elevated text-text-muted",
                )}
              >
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-semibold",
                    selected ? "text-text-primary" : "text-text-primary",
                  )}
                >
                  {ROUTING_STRATEGY_LABEL[s]}
                </p>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">
                  {ROUTING_STRATEGY_DESCRIPTION[s]}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
