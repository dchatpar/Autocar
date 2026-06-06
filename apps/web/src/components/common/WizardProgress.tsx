"use client";

/**
 * WizardProgress — visual step indicator for the multi-step wizard.
 *
 * Variants:
 *  - default : horizontal numbered chips connected by lines
 *  - compact : collapses to "Step 3 of 5" with mini progress bar (mobile)
 *
 * The component is fully presentational — the Wizard feeds it the data
 * (currentStep, steps, visited, completed, onStepClick).
 */

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardProgressStep {
  id: string;
  title: string;
  description?: string;
  optional?: boolean;
}

export interface WizardProgressProps {
  steps: WizardProgressStep[];
  currentStep: number;
  visited?: Set<number>;
  completed?: Set<number>;
  onStepClick?: (index: number) => void;
  /** Allow jumping only to visited steps. Default true. */
  restrictToVisited?: boolean;
  className?: string;
  /** Use compact "Step X of Y" layout. Default follows auto (compact on <sm). */
  variant?: "auto" | "full" | "compact";
}

function stepStateClass(
  isCurrent: boolean,
  isCompleted: boolean,
  isVisited: boolean
): string {
  if (isCurrent) {
    return "bg-accent text-bg-primary border-accent shadow-md shadow-accent/20";
  }
  if (isCompleted) {
    return "bg-success/15 text-success border-success/30";
  }
  if (isVisited) {
    return "bg-bg-elevated text-text-primary border-border-active";
  }
  return "bg-bg-elevated text-text-muted border-border";
}

function connectorClass(isCompleted: boolean): string {
  return isCompleted ? "bg-success/40" : "bg-border";
}

export function WizardProgress({
  steps,
  currentStep,
  visited = new Set(),
  completed = new Set(),
  onStepClick,
  restrictToVisited = true,
  className,
  variant = "auto",
}: WizardProgressProps) {
  /* Track viewport for auto variant. SSR-safe. */
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    if (variant !== "auto" || typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [variant]);

  const useCompact = variant === "compact" || (variant === "auto" && isCompact);

  if (useCompact) {
    return <WizardProgressCompact steps={steps} currentStep={currentStep} className={className} />;
  }

  return (
    <ol
      className={cn("flex items-start w-full gap-1", className)}
      aria-label="Progress"
    >
      {steps.map((step, index) => {
        const isCurrent = index === currentStep;
        const isCompleted = completed.has(index) && !isCurrent;
        const isVisited = visited.has(index) || isCurrent || isCompleted;
        const isClickable =
          onStepClick &&
          (!restrictToVisited || isVisited || index === currentStep);
        const isLast = index === steps.length - 1;

        return (
          <li
            key={step.id}
            className={cn("flex-1 flex items-start", isLast && "flex-none")}
            aria-current={isCurrent ? "step" : undefined}
          >
            <div className="flex flex-col items-center min-w-0 w-full">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(index)}
                className={cn(
                  "h-9 w-9 rounded-full border-2 flex items-center justify-center text-sm font-semibold transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
                  stepStateClass(isCurrent, isCompleted, isVisited),
                  isClickable ? "cursor-pointer" : "cursor-default"
                )}
                aria-label={`Step ${index + 1}: ${step.title}${isCompleted ? " (completed)" : ""}${isCurrent ? " (current)" : ""}`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </button>
              <div className="mt-2 text-center px-1 w-full">
                <div
                  className={cn(
                    "text-xs font-medium truncate",
                    isCurrent
                      ? "text-text-primary"
                      : isCompleted
                        ? "text-text-primary"
                        : "text-text-muted"
                  )}
                >
                  {step.title}
                  {step.optional && (
                    <span className="ml-1 text-text-muted font-normal">
                      (optional)
                    </span>
                  )}
                </div>
                {step.description && (
                  <div className="text-[10px] text-text-muted mt-0.5 line-clamp-2 leading-tight">
                    {step.description}
                  </div>
                )}
              </div>
            </div>
            {!isLast && (
              <div
                className={cn(
                  "h-0.5 flex-1 mt-[18px] mx-1 transition-colors",
                  connectorClass(completed.has(index) || (isVisited && index < currentStep))
                )}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function WizardProgressCompact({
  steps,
  currentStep,
  className,
}: {
  steps: WizardProgressStep[];
  currentStep: number;
  className?: string;
}) {
  const step = steps[currentStep];
  const total = steps.length;
  const completedCount = Math.min(currentStep, total);
  const percent = total === 0 ? 0 : Math.round(((currentStep + 1) / total) * 100);

  return (
    <div
      className={cn("flex flex-col gap-2 w-full", className)}
      aria-label="Wizard progress"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-text-primary">
          Step {currentStep + 1} of {total}
          {step?.title && (
            <span className="text-text-muted font-normal"> · {step.title}</span>
          )}
        </span>
        <span className="tabular-nums text-text-muted">{percent}%</span>
      </div>
      <div
        className="h-1.5 w-full bg-bg-elevated rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={currentStep + 1}
        aria-valuemin={1}
        aria-valuemax={total}
      >
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-text-muted">
        <span>
          {completedCount} completed
          {step?.optional && " · current step is optional"}
        </span>
        <span className="flex items-center gap-0.5">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                i < currentStep
                  ? "bg-success"
                  : i === currentStep
                    ? "bg-accent"
                    : "bg-border-active"
              )}
              aria-hidden="true"
            />
          ))}
        </span>
      </div>
    </div>
  );
}
