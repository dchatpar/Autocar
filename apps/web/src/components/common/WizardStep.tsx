"use client";

/**
 * WizardStep — wrapper that gives every wizard step:
 *  - A consistent header (number + title + description)
 *  - Animated entrance/exit (framer-motion)
 *  - Auto field-error summary at the top
 *  - A consistent focus target for keyboard / screen reader
 *
 * Usage:
 *   <WizardStep index={0} title="Vehicle basics" description="..." errors={errors}>
 *     <MyFormFields ... />
 *   </WizardStep>
 *
 * The actual form fields live in the children — this component is purely
 * the layout shell.
 */

import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface WizardStepProps {
  index: number;
  title: string;
  description?: string;
  /** Field-keyed errors for this step. */
  errors?: Record<string, string>;
  /** Whether to show the optional badge. */
  optional?: boolean;
  /** ID forwarded for `aria-labelledby` linking. */
  titleId?: string;
  children: ReactNode;
  className?: string;
}

export function WizardStep({
  index,
  title,
  description,
  errors = {},
  optional = false,
  titleId,
  children,
  className,
}: WizardStepProps) {
  const errorEntries = Object.entries(errors).filter(([k]) => k !== "_form");
  const formError = errors["_form"];
  const headingId = titleId ?? `wizard-step-${index}-title`;

  return (
    <motion.section
      role="group"
      aria-labelledby={headingId}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn("flex flex-col gap-6", className)}
    >
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 px-2 items-center rounded-full bg-bg-elevated text-[10px] font-semibold text-text-muted border border-border uppercase tracking-wide"
            aria-hidden="true"
          >
            Step {index + 1}
            {optional && <span className="ml-1">· Optional</span>}
          </span>
        </div>
        <h2
          id={headingId}
          className="text-xl sm:text-2xl font-bold text-text-primary"
        >
          {title}
        </h2>
        {description && (
          <p className="text-sm text-text-muted max-w-2xl">{description}</p>
        )}
      </header>

      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      {errorEntries.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Please fix the following:</p>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              {errorEntries.slice(0, 5).map(([field, message]) => (
                <li key={field}>
                  <span className="text-text-muted">{field}:</span> {message}
                </li>
              ))}
              {errorEntries.length > 5 && (
                <li className="list-none text-text-muted">
                  …and {errorEntries.length - 5} more
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      <div className="space-y-4">{children}</div>
    </motion.section>
  );
}
