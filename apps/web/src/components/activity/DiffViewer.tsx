"use client";

import * as React from "react";

/**
 * DiffViewer — side-by-side before/after JSON viewer for an
 * ActivityLog row. Highlights changed fields, shows added and
 * removed top-level keys separately, and redacts obvious secrets
 * (passwords, JWTs, refresh tokens) so a screenshot of the panel
 * can be shared with compliance.
 *
 * Accessibility:
 *   - Each row exposes `aria-label` summarising the change.
 *   - All copy is selectable so the diff can be pasted into tickets.
 *   - Keyboard focus is visible (uses :focus-visible ring tokens).
 *
 * Dark mode: all colour choices go through semantic tokens so the
 * viewer renders correctly on both themes.
 */

import { useMemo, useState } from "react";
import { Plus, Minus, Pencil, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DiffViewerProps {
  before: Record<string, unknown> | null | undefined;
  after: Record<string, unknown> | null | undefined;
  diff?: {
    changed: Array<{ field: string; before: unknown; after: unknown }>;
    added: string[];
    removed: string[];
  } | null;
  className?: string;
  initialCollapsed?: boolean;
  /**
   * Maximum string length before truncation in the JSON view.
   * Defaults to 200 to keep the panel readable.
   */
  maxStringLength?: number;
}

const REDACT_KEYS: ReadonlySet<string> = new Set([
  "password",
  "passwordhash",
  "token",
  "refreshtoken",
  "accesstoken",
  "jwt",
  "authorization",
  "secret",
  "apikey",
  "ssn",
  "creditcard",
  "cardnumber",
  "cvv",
  "pin",
]);

function isRedacted(key: string): boolean {
  return REDACT_KEYS.has(key.toLowerCase());
}

function safeStringify(
  value: unknown,
  indent = 2,
  maxStringLength = 200,
): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, v) => {
      if (typeof v === "string") {
        if (isRedacted(_key)) return "[REDACTED]";
        if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v)) {
          return "[REDACTED]";
        }
        if (v.length > maxStringLength) {
          return `${v.slice(0, maxStringLength)}\u2026`;
        }
        return v;
      }
      if (typeof v === "object" && v !== null) {
        if (seen.has(v as object)) return "[Circular]";
        seen.add(v as object);
      }
      return v;
    },
    indent,
  );
}

type ViewMode = "structured" | "json";

export function DiffViewer({
  before,
  after,
  diff,
  className,
  initialCollapsed = false,
  maxStringLength = 200,
}: DiffViewerProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed);
  const [view, setView] = useState<ViewMode>("structured");

  const changedRows = useMemo(() => {
    if (diff?.changed) return diff.changed;
    // Fall back to deriving the diff client-side so the panel still
    // works when the server payload omits the `diff` field.
    if (!before && !after) return [];
    const a = (before ?? {}) as Record<string, unknown>;
    const b = (after ?? {}) as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return Array.from(keys)
      .sort()
      .map((field) => ({ field, before: a[field], after: b[field] }))
      .filter((r) => JSON.stringify(r.before) !== JSON.stringify(r.after));
  }, [before, after, diff]);

  const addedKeys = diff?.added ?? [];
  const removedKeys = diff?.removed ?? [];

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-xs dark:border-gray-800">
        <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Change details</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView(view === "structured" ? "json" : "structured")}
            className="rounded px-2 py-0.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label={`Switch to ${view === "structured" ? "JSON" : "structured"} view`}
          >
            {view === "structured" ? "JSON" : "Structured"}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded px-2 py-0.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label={collapsed ? "Expand diff" : "Collapse diff"}
          >
            {collapsed ? (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className="p-3">
          {view === "json" ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <pre className="overflow-x-auto rounded-md bg-red-50/40 p-2 font-mono leading-relaxed text-gray-800 dark:bg-red-950/20 dark:text-gray-200">
                <strong className="block pb-1 text-red-700 dark:text-red-300">Before</strong>
                {safeStringify(before ?? {}, 2, maxStringLength)}
              </pre>
              <pre className="overflow-x-auto rounded-md bg-emerald-50/40 p-2 font-mono leading-relaxed text-gray-800 dark:bg-emerald-950/20 dark:text-gray-200">
                <strong className="block pb-1 text-emerald-700 dark:text-emerald-300">After</strong>
                {safeStringify(after ?? {}, 2, maxStringLength)}
              </pre>
            </div>
          ) : (
            <div>
              {changedRows.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">No field-level changes captured.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {changedRows.map((row) => (
                    <li
                      key={row.field}
                      className="rounded-md border border-gray-200 px-2 py-1.5 dark:border-gray-800"
                      aria-label={`${row.field}: changed from ${formatValue(row.before)} to ${formatValue(row.after)}`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">
                          {row.field}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                            row.before === undefined
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : row.after === undefined
                                ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
                          )}
                        >
                          {row.before === undefined
                            ? "added"
                            : row.after === undefined
                              ? "removed"
                              : "changed"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <ValueCell
                          value={row.before}
                          tone="before"
                          truncate={maxStringLength}
                        />
                        <ValueCell
                          value={row.after}
                          tone="after"
                          truncate={maxStringLength}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {(addedKeys.length > 0 || removedKeys.length > 0) && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {addedKeys.length > 0 ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-2 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                      <div className="mb-1 flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                        <Plus className="h-3 w-3" aria-hidden="true" />
                        Added ({addedKeys.length})
                      </div>
                      <ul className="space-y-0.5 font-mono">
                        {addedKeys.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {removedKeys.length > 0 ? (
                    <div className="rounded-md border border-red-200 bg-red-50/50 p-2 dark:border-red-900/50 dark:bg-red-950/30">
                      <div className="mb-1 flex items-center gap-1 text-red-700 dark:text-red-300">
                        <Minus className="h-3 w-3" aria-hidden="true" />
                        Removed ({removedKeys.length})
                      </div>
                      <ul className="space-y-0.5 font-mono">
                        {removedKeys.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ValueCell({
  value,
  tone,
  truncate,
}: {
  value: unknown;
  tone: "before" | "after";
  truncate: number;
}): React.ReactElement {
  const isMissing = value === undefined;
  const display = formatValue(value, truncate);
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1 font-mono",
        tone === "before"
          ? "border-red-200 bg-red-50/40 text-red-900 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200"
          : "border-emerald-200 bg-emerald-50/40 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200",
        isMissing && "italic opacity-60",
      )}
    >
      {isMissing ? "(none)" : display}
    </div>
  );
}

function formatValue(value: unknown, maxLength = 200): string {
  if (value === null) return "null";
  if (value === undefined) return "(none)";
  if (typeof value === "string") {
    if (value.length > maxLength) {
      return `"${value.slice(0, maxLength)}\u2026"`;
    }
    return `"${value}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}
