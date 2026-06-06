"use client";

/**
 * DuplicateCompare — side-by-side comparison of two customer records
 * with a per-field radio picker for the merge decision.
 *
 * Layout:
 *   ┌───────────────┬───────────────┐
 *   │ Record A      │ Record B      │
 *   ├───────────────┼───────────────┤
 *   │ firstName     │ firstName     │   ← radio: A | B
 *   │ email         │ email         │
 *   │ phone         │ phone         │
 *   │ ...           │ ...           │
 *   └───────────────┴───────────────┘
 *   [Preview]  [Cancel]  [Confirm merge]
 *
 * The component is "controlled" — the parent owns the open/close
 * state, the chosen `masterId`, and the result handler. We keep
 * internal state for the per-field picks + the preview result.
 *
 * Multi-step:
 *   1. Show the table with default picks = master.
 *   2. Click "Preview" → server-side previewMerge() returns what the
 *      merged record will look like; we render the preview card.
 *   3. Click "Confirm" → mergeCustomers() executes the merge.
 *   4. On success, parent closes + shows toast.
 */

import { useMemo, useState, useEffect } from "react";
import { Check, X, Eye, GitMerge, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  usePreviewMerge,
  useMergeCustomers,
  type FieldChoice,
  type FieldChoices,
  type MergePreview,
  type MergeableField,
  type CustomerLite,
} from "@/hooks/useDuplicateDetection";

export interface DuplicateCompareProps {
  isOpen: boolean;
  onClose: () => void;
  /** Either customer can be the master — picked via the UI. */
  masterId: string | null;
  duplicateId: string | null;
  recordA: CustomerLite | null;
  recordB: CustomerLite | null;
  /** Optional pre-computed match reasons from the detector. */
  reasons?: string[];
  score?: number;
  /** Called after a successful merge so the parent can refetch. */
  onMerged?: (master: CustomerLite, duplicate: CustomerLite) => void;
}

interface FieldRow {
  field: MergeableField;
  label: string;
  /** Render as a free-form string (most fields). */
  stringify?: (c: CustomerLite) => string;
  /** Optional icon/format override. */
}

const FIELD_ROWS: ReadonlyArray<FieldRow> = [
  { field: "firstName", label: "First name" },
  { field: "lastName", label: "Last name" },
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone" },
  { field: "dob", label: "Date of birth" },
  { field: "dlNumber", label: "Driver's licence" },
  { field: "dlProvince", label: "DL province" },
  { field: "creditTier", label: "Credit tier" },
  { field: "address", label: "Address" },
  { field: "tags", label: "Tags" },
  { field: "notes", label: "Notes" },
];

function valueOf(c: CustomerLite | null, field: MergeableField): string {
  if (!c) return "—";
  switch (field) {
    case "firstName":
      return c.firstName ?? "";
    case "lastName":
      return c.lastName ?? "";
    case "email":
      return c.email ?? "";
    case "phone":
      return c.phone ?? "";
    case "dob":
      return ""; // not in CustomerLite
    case "dlNumber":
      return ""; // not in CustomerLite
    case "dlProvince":
      return ""; // not in CustomerLite
    case "creditTier":
      return c.creditTier ?? "";
    case "tags":
      return (c.tags ?? []).join(", ");
    case "notes":
      return ""; // not in CustomerLite
    case "address":
      return ""; // not in CustomerLite
    default:
      return "";
  }
}

function compareValues(a: string, b: string): boolean {
  if (!a && !b) return true;
  return a === b;
}

export function DuplicateCompare({
  isOpen,
  onClose,
  masterId,
  duplicateId,
  recordA,
  recordB,
  reasons = [],
  score,
  onMerged,
}: DuplicateCompareProps) {
  // The two sides the user sees — labelled A and B. The actual
  // "master" id is determined by which radio they pick as default.
  // We default to A = master (the left column).
  const sideA: "master" | "duplicate" = "master";
  const sideB: "master" | "duplicate" = "duplicate";

  const [choices, setChoices] = useState<FieldChoices>({});
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Reset whenever the modal opens fresh.
  useEffect(() => {
    if (isOpen) {
      setChoices({});
      setPreview(null);
      setPreviewError(null);
    }
  }, [isOpen, masterId, duplicateId]);

  const previewMutation = usePreviewMerge();
  const mergeMutation = useMergeCustomers();

  const canSubmit = useMemo(
    () => Boolean(masterId && duplicateId && masterId !== duplicateId),
    [masterId, duplicateId],
  );

  function setChoice(field: MergeableField, value: FieldChoice) {
    setChoices((prev) => ({ ...prev, [field]: value }));
  }

  async function handlePreview() {
    if (!canSubmit) return;
    setPreviewError(null);
    setPreview(null);
    try {
      const result = await previewMutation.mutateAsync({
        masterId: masterId as string,
        duplicateId: duplicateId as string,
        fieldChoices: choices,
      });
      setPreview(result);
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : "Preview failed",
      );
    }
  }

  async function handleConfirm() {
    if (!canSubmit) return;
    try {
      const result = await mergeMutation.mutateAsync({
        masterId: masterId as string,
        duplicateId: duplicateId as string,
        fieldChoices: choices,
      });
      onMerged?.(result.master, result.duplicate);
      onClose();
    } catch {
      // mutation.error will render below
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Compare & merge customers"
      description="Pick which value wins for each field. The duplicate will be soft-deleted and recoverable for 30 days."
      size="xl"
    >
      <div className="space-y-4">
        {/* Match reasons */}
        {reasons.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start gap-2 flex-wrap">
                <Badge variant="warning" className="text-[11px]">
                  {typeof score === "number"
                    ? `${Math.round(score * 100)}% match`
                    : "Possible duplicate"}
                </Badge>
                <ul
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted"
                  aria-label="Match reasons"
                >
                  {reasons.map((r, i) => (
                    <li key={i} className="inline-flex items-center gap-1">
                      <span className="h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Side-by-side compare table */}
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[1fr_auto_1fr] divide-x divide-border bg-bg-elevated text-xs uppercase tracking-wider text-text-muted">
            <div className="px-3 py-2 font-semibold">Record A · master</div>
            <div className="px-3 py-2 text-center">Pick</div>
            <div className="px-3 py-2 font-semibold">Record B · duplicate</div>
          </div>
          <ul role="list" className="divide-y divide-border">
            {FIELD_ROWS.map((row) => {
              const aVal = valueOf(recordA, row.field);
              const bVal = valueOf(recordB, row.field);
              const identical = compareValues(aVal, bVal);
              const choice: FieldChoice = choices[row.field] ?? sideA;

              return (
                <li
                  key={row.field}
                  className={cn(
                    "grid grid-cols-[1fr_auto_1fr] divide-x divide-border",
                    identical && "opacity-60",
                  )}
                >
                  <div className="px-3 py-2 text-sm text-text-primary">
                    {aVal || <span className="text-text-muted">—</span>}
                  </div>
                  <div className="px-3 py-2 flex flex-col items-center justify-center gap-1">
                    <span className="sr-only">{row.label}</span>
                    <label className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                      <input
                        type="radio"
                        name={`choice-${row.field}`}
                        checked={choice === sideA}
                        onChange={() => setChoice(row.field, sideA)}
                        className="accent-accent"
                        aria-label={`Use Record A's ${row.label}`}
                      />
                      <span>A</span>
                    </label>
                    <label className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                      <input
                        type="radio"
                        name={`choice-${row.field}`}
                        checked={choice === sideB}
                        onChange={() => setChoice(row.field, sideB)}
                        className="accent-accent"
                        aria-label={`Use Record B's ${row.label}`}
                      />
                      <span>B</span>
                    </label>
                  </div>
                  <div className="px-3 py-2 text-sm text-text-primary">
                    {bVal || <span className="text-text-muted">—</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Preview result */}
        {preview && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-text-muted" aria-hidden="true" />
                <CardTitle>Preview — merged record will look like</CardTitle>
              </div>
              <CardDescription>
                {preview.movedCounts.deals +
                  preview.movedCounts.leads +
                  preview.movedCounts.appointments +
                  preview.movedCounts.activities +
                  preview.movedCounts.communications}{" "}
                related records will be reassigned.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <Pair label="First name" value={preview.merged.firstName} />
                <Pair label="Last name" value={preview.merged.lastName} />
                <Pair label="Email" value={preview.merged.email ?? "—"} />
                <Pair label="Phone" value={preview.merged.phone ?? "—"} />
                <Pair
                  label="Credit tier"
                  value={preview.merged.creditTier ?? "—"}
                />
                <Pair
                  label="Tags"
                  value={
                    preview.merged.tags.length > 0
                      ? preview.merged.tags.join(", ")
                      : "—"
                  }
                />
              </dl>
              <p className="mt-3 text-xs text-text-muted">
                Counts: {preview.movedCounts.deals} deals, {preview.movedCounts.leads} leads, {preview.movedCounts.appointments} appointments, {preview.movedCounts.activities} activities, {preview.movedCounts.communications} communications.
              </p>
            </CardContent>
          </Card>
        )}

        {previewError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 text-danger text-sm" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span>{previewError}</span>
          </div>
        )}

        {mergeMutation.isError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 text-danger text-sm" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span>
              {mergeMutation.error instanceof Error
                ? mergeMutation.error.message
                : "Merge failed"}
            </span>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            type="button"
            aria-label="Cancel merge"
          >
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={handlePreview}
            disabled={!canSubmit || previewMutation.isPending}
            isLoading={previewMutation.isPending}
            aria-label="Preview merge result"
          >
            <Eye className="h-4 w-4" /> Preview
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit || mergeMutation.isPending}
            isLoading={mergeMutation.isPending}
            aria-label="Confirm and execute merge"
          >
            {mergeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="h-4 w-4" />
            )}
            <Check className="h-4 w-4" /> Confirm merge
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm text-text-primary mt-0.5 break-words">{value}</dd>
    </div>
  );
}
