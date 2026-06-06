"use client";

/**
 * Wizard — generic, reusable multi-step wizard.
 *
 * Composes:
 *  - WizardProgress  (step indicator)
 *  - WizardStep      (per-step layout shell)
 *  - AnimatePresence (framer-motion transitions)
 *  - useWizardState  (state machine + autosave/restore)
 *
 * Data model:
 *  - The wizard payload is generic over T (caller's form data type)
 *  - Each step is a WizardStepDef with id/title/description/validate/optional
 *  - Steps are pure presentational React components that receive
 *    { data, update, errors, isFirstStep, isLastStep }
 *
 * Features:
 *  - Per-step Zod validation (via useWizardValidation)
 *  - Back / Next / Skip / Submit controls
 *  - Auto-save to localStorage every 30s + restore on mount
 *  - Warn on unsaved exit
 *  - Animated transitions (framer-motion)
 *  - Mobile-responsive (collapses to "Step 3 of 5")
 *  - Dark mode using design tokens
 *  - WCAG 2.1 AA
 *
 * See /workspace/apps/web/src/app/inventory/new/page.tsx for a usage example.
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { useWizardState, type WizardStepDef } from "@/hooks/useWizardState";
import { useHasMounted } from "@/hooks/useLocalStorage";

import { WizardProgress } from "./WizardProgress";
import { WizardStep } from "./WizardStep";

export interface WizardStepProps2<T> {
  data: T;
  update: (partial: Partial<T>) => void;
  errors: Record<string, string>;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export interface WizardStepDef2<T> {
  id: string;
  title: string;
  description?: string;
  component: React.ComponentType<WizardStepProps2<T>>;
  validate?: (data: T) => boolean | Promise<boolean>;
  validateErrors?: (data: T) => Record<string, string>;
  optional?: boolean;
}

export interface WizardProps<T> {
  steps: WizardStepDef2<T>[];
  initialData: T;
  /** localStorage key — when provided, autosave + restore are enabled. */
  storageKey?: string;
  /** Header text shown above the progress bar. */
  title: string;
  /** Optional description under the title. */
  description?: string;
  /** Called once on successful submit. */
  onComplete: (data: T) => Promise<void> | void;
  /** Called on Cancel. Default: navigate(-1). */
  onCancel?: () => void;
  /** Custom submit button label. Default "Submit". */
  submitLabel?: string;
  /** Whether to allow the user to navigate back to completed steps. */
  allowJumpBack?: boolean;
  /** Optional header right-side content (e.g. status). */
  headerExtra?: ReactNode;
  /** Custom labels for the Next button (per step). Index = step number. */
  nextLabelByStep?: string[];
  className?: string;
  /** Restrict the wizard to a max viewport width. */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
}

const MAX_WIDTHS = {
  sm: "max-w-xl",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
  "2xl": "max-w-6xl",
  full: "max-w-full",
} as const;

const STEP_TITLES_FOR_PROGRESS = <T,>(steps: WizardStepDef2<T>[]) =>
  steps.map((s) => ({ id: s.id, title: s.title, description: s.description, optional: s.optional }));

function formatTime(ts: number | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function Wizard<T>({
  steps,
  initialData,
  storageKey,
  title,
  description,
  onComplete,
  onCancel,
  submitLabel = "Submit",
  allowJumpBack = true,
  headerExtra,
  nextLabelByStep,
  className,
  maxWidth = "lg",
}: WizardProps<T>) {
  const router = useRouter();
  const mounted = useHasMounted();

  /* ----------------------- state machine -------------------- */
  const wiz = useWizardState<T>({
    steps: steps as unknown as WizardStepDef<T>[],
    initialData,
    storageKey,
  });

  const [showRestoreNotice, setShowRestoreNotice] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Show "restored from autosave" notice on first mount
  useEffect(() => {
    if (!mounted) return;
    if (storageKey && wiz.lastSavedAt && wiz.currentStep > 0) {
      setShowRestoreNotice(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  /* ----------------------- handlers ------------------------- */
  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
      return;
    }
    if (wiz.hasUnsavedChanges) {
      const ok = window.confirm("You have unsaved changes. Leave anyway?");
      if (!ok) return;
    }
    router.back();
  }, [onCancel, router, wiz.hasUnsavedChanges]);

  const handleNext = useCallback(async () => {
    setSubmitError(null);
    const ok = await wiz.next();
    if (!ok) {
      // Errors already set by wiz.next()
    }
  }, [wiz]);

  const handleBack = useCallback(() => {
    wiz.back();
  }, [wiz]);

  const handleSkip = useCallback(() => {
    wiz.skip();
  }, [wiz]);

  const handleStepClick = useCallback(
    (idx: number) => {
      if (!allowJumpBack) return;
      // Allow jumping to: current, or any visited/completed
      const canJump =
        idx === wiz.currentStep ||
        wiz.visited.has(idx) ||
        wiz.completed.has(idx);
      if (!canJump) return;
      wiz.goTo(idx);
    },
    [allowJumpBack, wiz]
  );

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    wiz.setData(() => wiz.data); // no-op to ensure latest
    // Final pass: validate every step
    const ok = await wiz.submit();
    if (!ok) return;
    try {
      await onComplete(wiz.data);
      // Clear storage on success
      wiz.clearStorage();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Submission failed. Please try again."
      );
    }
  }, [wiz, onComplete]);

  /* ----------------------- derived -------------------------- */
  const progressSteps = useMemo(() => STEP_TITLES_FOR_PROGRESS(steps), [steps]);
  const currentStepDef = steps[wiz.currentStep];
  const nextLabel =
    nextLabelByStep?.[wiz.currentStep] ??
    (wiz.isLastStep ? submitLabel : "Continue");
  const canSkip = Boolean(currentStepDef?.optional);

  /* ----------------------- render --------------------------- */
  return (
    <div
      className={cn(
        "mx-auto w-full flex flex-col gap-6 px-4 sm:px-6 py-6",
        MAX_WIDTHS[maxWidth],
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">{title}</h1>
          {description && (
            <p className="text-sm text-text-muted mt-1 max-w-2xl">{description}</p>
          )}
        </div>
        {headerExtra ?? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            {storageKey && (
              <SaveStatus
                lastSavedAt={mounted ? wiz.lastSavedAt : null}
                onFlush={wiz.flushSave}
              />
            )}
          </div>
        )}
      </div>

      {/* Restore notice */}
      {showRestoreNotice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-text-primary"
        >
          <RefreshCw className="h-4 w-4 mt-0.5 text-info flex-shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium text-info">Draft restored</p>
            <p className="text-text-muted mt-0.5">
              We picked up where you left off. Your progress is auto-saved every 30s.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              wiz.reset();
              setShowRestoreNotice(false);
            }}
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Start over
          </button>
          <button
            type="button"
            onClick={() => setShowRestoreNotice(false)}
            aria-label="Dismiss"
            className="text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Progress */}
      <Card className="p-4 sm:p-5">
        <WizardProgress
          steps={progressSteps}
          currentStep={wiz.currentStep}
          visited={wiz.visited}
          completed={wiz.completed}
          onStepClick={handleStepClick}
        />
      </Card>

      {/* Step content */}
      <Card className="p-5 sm:p-7 min-h-[400px] relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentStepDef?.id ?? wiz.currentStep}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {currentStepDef && (
              <StepRenderer
                step={currentStepDef}
                data={wiz.data}
                update={wiz.setData}
                errors={wiz.errors}
                isFirstStep={wiz.isFirstStep}
                isLastStep={wiz.isLastStep}
                isValidating={wiz.isValidating}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {submitError && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
          >
            <X className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{submitError}</span>
          </div>
        )}
      </Card>

      {/* Footer controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            aria-label="Cancel wizard"
          >
            <X className="h-4 w-4" />
            <span>Cancel</span>
          </Button>
          {storageKey && mounted && wiz.hasUnsavedChanges && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => wiz.flushSave()}
              aria-label="Save draft now"
              className="text-text-muted"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save draft</span>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!wiz.isFirstStep && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleBack}
              disabled={wiz.isValidating}
              aria-label="Previous step"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
          )}
          {canSkip && !wiz.isLastStep && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleSkip}
              disabled={wiz.isValidating}
            >
              Skip
            </Button>
          )}
          {wiz.isLastStep ? (
            <Button
              type="button"
              variant="primary"
              onClick={handleSubmit}
              disabled={wiz.isValidating}
              aria-label="Submit"
            >
              {wiz.isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              <span>{submitLabel}</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={handleNext}
              disabled={wiz.isValidating}
              aria-label="Next step"
            >
              {wiz.isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              <span>{nextLabel}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Internal: renders the step component inside the WizardStep shell  */
/* ------------------------------------------------------------------ */

function StepRenderer<T>({
  step,
  data,
  update,
  errors,
  isFirstStep,
  isLastStep,
  isValidating,
}: {
  step: WizardStepDef2<T>;
  data: T;
  update: (partial: Partial<T>) => void;
  errors: Record<string, string>;
  isFirstStep: boolean;
  isLastStep: boolean;
  isValidating: boolean;
}) {
  const StepComponent = step.component;
  return (
    <WizardStep
      index={0}
      title={step.title}
      description={step.description}
      errors={isValidating ? {} : errors}
      optional={step.optional}
    >
      <StepComponent
        data={data}
        update={update}
        errors={errors}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
      />
    </WizardStep>
  );
}

/* ------------------------------------------------------------------ */
/* Save status indicator                                              */
/* ------------------------------------------------------------------ */

function SaveStatus({
  lastSavedAt,
  onFlush,
}: {
  lastSavedAt: number | null;
  onFlush: () => number | null;
}) {
  const [pulse, setPulse] = useState(false);

  const handleFlush = () => {
    onFlush();
    setPulse(true);
    setTimeout(() => setPulse(false), 800);
  };

  return (
    <button
      type="button"
      onClick={handleFlush}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
        "text-text-muted hover:text-text-primary hover:bg-bg-elevated",
        pulse && "bg-success/10 text-success"
      )}
      aria-label={`Last saved at ${formatTime(lastSavedAt)}. Click to save now.`}
    >
      <Save className="h-3.5 w-3.5" />
      <span>Saved {formatTime(lastSavedAt)}</span>
    </button>
  );
}
