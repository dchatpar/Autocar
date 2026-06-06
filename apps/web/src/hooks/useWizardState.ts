"use client";

/**
 * useWizardState — generic state machine for multi-step wizards.
 *
 * Responsibilities:
 *  - Track current step + data
 *  - Validate per-step (sync or async) before allowing navigation
 *  - Auto-save to localStorage every `autosaveMs` (default 30s)
 *  - Restore from localStorage on mount (only if storageKey provided)
 *  - Track which steps have been visited + completed (for progress UI)
 *  - Warn on unsaved exit via beforeunload
 *  - Expose `hasUnsavedChanges` so caller can guard in-app navigation
 *
 * The hook is fully data-agnostic — `<T>` is the wizard payload type.
 *
 * Example:
 *   const w = useWizardState<VehicleFormData>({
 *     steps,
 *     initialData,
 *     storageKey: "wizard:add-vehicle",
 *     onComplete: async (data) => api.post("/inventory", data),
 *   });
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface WizardStepDef<T> {
  id: string;
  title: string;
  description?: string;
  /** Sync or async validator. Throw/Zod-fail-safe returns false. */
  validate?: (data: T) => boolean | Promise<boolean>;
  /** Per-step errors. Populated by validate(); surfaced to <WizardStep>. */
  validateErrors?: (data: T) => Record<string, string>;
  /** Step can be skipped via the "Skip" button. */
  optional?: boolean;
}

export interface UseWizardStateOptions<T> {
  steps: WizardStepDef<T>[];
  initialData: T;
  /** localStorage key — when provided, autosave + restore are enabled. */
  storageKey?: string;
  /** Milliseconds between autosaves. Default 30 000. */
  autosaveMs?: number;
  /** Persist this snapshot on every change. */
  onPersist?: (data: T, currentStep: number) => void;
  /**
   * If true, calling `next()` while invalid returns `false` and runs
   * the validator. Default true.
   */
  blockNavigationOnInvalid?: boolean;
}

export interface UseWizardStateResult<T> {
  data: T;
  currentStep: number;
  stepIndex: number;
  totalSteps: number;
  currentStepDef: WizardStepDef<T>;
  isFirstStep: boolean;
  isLastStep: boolean;
  visited: Set<number>;
  completed: Set<number>;
  errors: Record<string, string>;
  isValidating: boolean;
  isSubmitting: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  setData: (updater: Partial<T> | ((prev: T) => T)) => void;
  goTo: (step: number) => boolean;
  next: () => Promise<boolean>;
  back: () => void;
  skip: () => void;
  submit: () => Promise<boolean>;
  reset: () => void;
  clearStorage: () => void;
  /** Force a save right now. Returns timestamp of save. */
  flushSave: () => number | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const EMPTY_ERRORS: Record<string, string> = {};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadFromStorage<T>(key: string): { data: T; step: number } | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const parsed = safeParse<{ data: T; step: number; savedAt: number }>(raw);
  if (!parsed || typeof parsed !== "object") return null;
  if (!("data" in parsed) || !("step" in parsed)) return null;
  return { data: parsed.data, step: parsed.step };
}

function persistToStorage<T>(key: string, data: T, step: number, savedAt: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ data, step, savedAt })
    );
  } catch {
    /* quota or private mode — ignore */
  }
}

function clearStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Hook                                                               */
/* ------------------------------------------------------------------ */

export function useWizardState<T>(opts: UseWizardStateOptions<T>): UseWizardStateResult<T> {
  const {
    steps,
    initialData,
    storageKey,
    autosaveMs = 30_000,
    onPersist,
    blockNavigationOnInvalid = true,
  } = opts;

  /* ------------------------ state ------------------------- */
  const [data, setDataInternal] = useState<T>(initialData);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>(EMPTY_ERRORS);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  /* ------------------------ refs -------------------------- */
  const dataRef = useRef(data);
  const stepRef = useRef(currentStep);
  const autosaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track the "initial" snapshot for hasUnsavedChanges comparison
  const baselineRef = useRef<{ data: T; step: number }>({ data: initialData, step: 0 });

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    stepRef.current = currentStep;
  }, [currentStep]);

  /* ------------------------ restore on mount -------------- */
  useEffect(() => {
    if (!storageKey) {
      setHydrated(true);
      return;
    }
    const restored = loadFromStorage<T>(storageKey);
    if (restored) {
      setDataInternal(restored.data);
      setCurrentStep(Math.min(Math.max(restored.step, 0), steps.length - 1));
      setVisited(new Set([0, restored.step]));
      baselineRef.current = { data: restored.data, step: restored.step };
      setLastSavedAt(Date.now());
    }
    setHydrated(true);
  }, [storageKey, steps.length]);

  /* ------------------------ autosave ----------------------- */
  const flushSave = useCallback((): number | null => {
    if (!storageKey) return null;
    const now = Date.now();
    persistToStorage(storageKey, dataRef.current, stepRef.current, now);
    setLastSavedAt(now);
    onPersist?.(dataRef.current, stepRef.current);
    return now;
  }, [storageKey, onPersist]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    autosaveTimerRef.current = setInterval(() => {
      flushSave();
    }, autosaveMs);
    return () => {
      if (autosaveTimerRef.current) {
        clearInterval(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [storageKey, autosaveMs, hydrated, flushSave]);

  /* ------------------------ unsaved changes --------------- */
  useEffect(() => {
    if (!hydrated) return;
    const initial = baselineRef.current.data;
    const isDirty =
      JSON.stringify(data) !== JSON.stringify(initial) || currentStep !== baselineRef.current.step;
    setHasUnsavedChanges(isDirty);
  }, [data, currentStep, hydrated]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  /* ------------------------ mutations --------------------- */
  const setData = useCallback(
    (updater: Partial<T> | ((prev: T) => T)) => {
      setDataInternal((prev) => {
        if (typeof updater === "function") {
          return (updater as (p: T) => T)(prev);
        }
        return { ...prev, ...updater };
      });
    },
    []
  );

  const runValidation = useCallback(
    async (step: number): Promise<{ ok: boolean; fieldErrors: Record<string, string> }> => {
      const def = steps[step];
      if (!def) return { ok: true, fieldErrors: EMPTY_ERRORS };
      if (!def.validate && !def.validateErrors) return { ok: true, fieldErrors: EMPTY_ERRORS };
      setIsValidating(true);
      try {
        const ok = def.validate ? await def.validate(dataRef.current) : true;
        const fieldErrors = def.validateErrors ? def.validateErrors(dataRef.current) : EMPTY_ERRORS;
        return { ok: Boolean(ok) && Object.keys(fieldErrors).length === 0, fieldErrors };
      } catch (err) {
        return {
          ok: false,
          fieldErrors: { _form: err instanceof Error ? err.message : "Validation failed" },
        };
      } finally {
        setIsValidating(false);
      }
    },
    [steps]
  );

  const goTo = useCallback(
    (step: number): boolean => {
      if (step < 0 || step >= steps.length) return false;
      // Forward navigation must pass validation unless going backward
      if (step > currentStep && blockNavigationOnInvalid) {
        // run async — but goTo is sync. Caller should call next() for forward.
        // For now: allow direct jumps if step has been completed.
        if (!completed.has(step) && step !== currentStep + 1) {
          return false;
        }
      }
      setCurrentStep(step);
      setErrors(EMPTY_ERRORS);
      setVisited((prev) => new Set(prev).add(step));
      return true;
    },
    [steps.length, currentStep, completed, blockNavigationOnInvalid]
  );

  const next = useCallback(async (): Promise<boolean> => {
    const result = await runValidation(currentStep);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      return false;
    }
    setErrors(EMPTY_ERRORS);
    setCompleted((prev) => new Set(prev).add(currentStep));
    if (currentStep < steps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setVisited((prev) => new Set(prev).add(nextStep));
      return true;
    }
    return true; // last step — caller should invoke submit()
  }, [currentStep, runValidation, steps.length]);

  const back = useCallback(() => {
    if (currentStep === 0) return;
    const prevStep = currentStep - 1;
    setCurrentStep(prevStep);
    setErrors(EMPTY_ERRORS);
    setVisited((prev) => new Set(prev).add(prevStep));
  }, [currentStep]);

  const skip = useCallback(() => {
    const def = steps[currentStep];
    if (!def?.optional) return;
    if (currentStep < steps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setVisited((prev) => new Set(prev).add(nextStep));
    }
  }, [currentStep, steps]);

  const submit = useCallback(async (): Promise<boolean> => {
    // Validate all steps in order
    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      const result = await runValidation(i);
      if (!result.ok) {
        setErrors(result.fieldErrors);
        return false;
      }
      setCompleted((prev) => new Set(prev).add(i));
    }
    return true;
  }, [steps, runValidation]);

  const reset = useCallback(() => {
    setDataInternal(initialData);
    setCurrentStep(0);
    setVisited(new Set([0]));
    setCompleted(new Set());
    setErrors(EMPTY_ERRORS);
    setHasUnsavedChanges(false);
    baselineRef.current = { data: initialData, step: 0 };
    if (storageKey) {
      clearStorage(storageKey);
    }
  }, [initialData, storageKey]);

  const clearStorageEntry = useCallback(() => {
    if (storageKey) clearStorage(storageKey);
    setLastSavedAt(null);
  }, [storageKey]);

  /* ------------------------ derived ----------------------- */
  const currentStepDef = useMemo(
    () => steps[currentStep] ?? steps[0],
    [steps, currentStep]
  );
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  return {
    data,
    currentStep,
    stepIndex: currentStep,
    totalSteps: steps.length,
    currentStepDef,
    isFirstStep,
    isLastStep,
    visited,
    completed,
    errors,
    isValidating,
    isSubmitting: isSubmitting,
    hasUnsavedChanges,
    lastSavedAt,
    setData,
    goTo,
    next,
    back,
    skip,
    submit,
    reset,
    clearStorage: clearStorageEntry,
    flushSave,
  };
}
