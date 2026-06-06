"use client";

/**
 * useWizardValidation — bridges Zod schemas to the Wizard's validator API.
 *
 * Example:
 *   const v = useWizardValidation<MyFormData>({
 *     step1: { schema: step1Schema, fields: ["name", "email"] },
 *     step2: { schema: step2Schema, fields: ["price", "vin"] },
 *   });
 *
 *   // returns a record of step-id -> WizardStepDef
 *   const steps = useMemo(() => ([
 *     { id: "step1", title: "Basics", validate: v.validate.step1, validateErrors: v.errors.step1 },
 *     ...
 *   ]), [v]);
 */

import { useCallback, useMemo } from "react";
import type { ZodError, ZodSchema, ZodTypeAny } from "zod";

export interface WizardValidationConfig<T> {
  [stepId: string]: {
    /** Zod schema for the entire payload — only the listed `fields` are checked. */
    schema: ZodTypeAny;
    /** Top-level keys this step is responsible for. */
    fields: (keyof T)[];
  };
}

export interface UseWizardValidationResult<T> {
  /** Map of stepId -> validator function for useWizardState. */
  validate: Record<string, (data: T) => boolean>;
  /** Map of stepId -> fieldErrors function for useWizardState. */
  errors: Record<string, (data: T) => Record<string, string>>;
  /** Run all validators; returns first failing step or null. */
  validateAll: (data: T) => Promise<{ ok: boolean; failedStep?: string; fieldErrors?: Record<string, string> }>;
  /** Validate a single field across schemas. */
  validateField: (data: T, field: keyof T) => { ok: boolean; error?: string };
}

function flattenZodError(err: ZodError, fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.join(".");
    if (!path) continue;
    if (fields.includes(path) || fields.some((f) => path.startsWith(`${String(f)}.`))) {
      out[path] = issue.message;
    }
  }
  return out;
}

function pickFields<T>(data: T, fields: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const f of fields) {
    out[f] = data[f];
  }
  return out;
}

export function useWizardValidation<T>(
  config: WizardValidationConfig<T>
): UseWizardValidationResult<T> {
  const stepIds = useMemo(() => Object.keys(config), [config]);

  const validate = useMemo(() => {
    const map: Record<string, (data: T) => boolean> = {};
    for (const id of stepIds) {
      const cfg = config[id];
      map[id] = (data: T) => {
        const slice = pickFields(data, cfg.fields);
        const result = (cfg.schema as ZodSchema).safeParse(slice);
        return result.success;
      };
    }
    return map;
  }, [config, stepIds]);

  const errors = useMemo(() => {
    const map: Record<string, (data: T) => Record<string, string>> = {};
    for (const id of stepIds) {
      const cfg = config[id];
      map[id] = (data: T) => {
        const slice = pickFields(data, cfg.fields);
        const result = (cfg.schema as ZodSchema).safeParse(slice);
        if (result.success) return {};
        return flattenZodError(result.error, cfg.fields as string[]);
      };
    }
    return map;
  }, [config, stepIds]);

  const validateAll = useCallback(
    async (data: T) => {
      for (const id of stepIds) {
        const cfg = config[id];
        const slice = pickFields(data, cfg.fields);
        const result = (cfg.schema as ZodSchema).safeParse(slice);
        if (!result.success) {
          return {
            ok: false,
            failedStep: id,
            fieldErrors: flattenZodError(result.error, cfg.fields as string[]),
          };
        }
      }
      return { ok: true };
    },
    [config, stepIds]
  );

  const validateField = useCallback(
    (_data: T, field: keyof T) => {
      for (const id of stepIds) {
        const cfg = config[id];
        if (!cfg.fields.includes(field)) continue;
        const slice = pickFields(_data, [field]);
        const result = (cfg.schema as ZodSchema).safeParse(slice);
        if (!result.success) {
          const issue = result.error.issues.find((i) => i.path[0] === field);
          return { ok: false, error: issue?.message };
        }
      }
      return { ok: true };
    },
    [config, stepIds]
  );

  return { validate, errors, validateAll, validateField };
}
