"use client";

/**
 * AudienceBuilder — filter for the campaign audience.
 *
 * Mirrors the Lead list filter surface so the same vocabulary the
 * sales team already uses applies here. The filter is JSON-serialised
 * onto the Campaign.audience column.
 *
 * Filters:
 *   - source           (Website / Phone / Walk-in / etc.)
 *   - status           (NEW / CONTACTED / APPOINTMENT / DEAL / LOST)
 *   - classification   (cold / warm / hot)
 *   - assignedToId     (UUID or "all")
 *   - search           (freeform name / email / phone)
 *   - includeCustomers (boolean — include customers in addition to leads)
 *   - maxEnroll        (number — cap on initial enrollment for backfill)
 */

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Users, Target, BarChart3, Search, type LucideIcon } from "lucide-react";

export interface AudienceValue {
  source?: string;
  status?: string;
  classification?: "cold" | "warm" | "hot";
  assignedTo?: string;
  search?: string;
  includeCustomers?: boolean;
  maxEnroll?: number;
}

interface AudienceBuilderProps {
  value: AudienceValue;
  onChange: (v: AudienceValue) => void;
  errors?: Record<string, string>;
}

const SOURCE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Any source" },
  { value: "Website", label: "Website" },
  { value: "Phone", label: "Phone" },
  { value: "Walk-in", label: "Walk-in" },
  { value: "Referral", label: "Referral" },
  { value: "Facebook", label: "Facebook" },
  { value: "Google Ads", label: "Google Ads" },
  { value: "Email", label: "Email" },
  { value: "Other", label: "Other" },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Any status" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "APPOINTMENT", label: "Appointment" },
  { value: "DEMO", label: "Demo" },
  { value: "DEAL", label: "Deal" },
  { value: "LOST", label: "Lost" },
];

const CLASSIFICATION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Any" },
  { value: "hot", label: "Hot (61+)" },
  { value: "warm", label: "Warm (31–60)" },
  { value: "cold", label: "Cold (0–30)" },
];

export function AudienceBuilder({ value, onChange, errors }: AudienceBuilderProps) {
  const summary = useMemo(() => buildSummary(value), [value]);

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-bg-elevated/30">
        <div className="flex items-center gap-2 text-text-muted mb-3">
          <Target className="h-4 w-4" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-text-primary">Filter criteria</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Lead source"
            value={value.source ?? ""}
            onChange={(v) => onChange({ ...value, source: v || undefined })}
            options={[...SOURCE_OPTIONS]}
            error={errors?.source}
          />
          <Select
            label="Lead status"
            value={value.status ?? ""}
            onChange={(v) => onChange({ ...value, status: v || undefined })}
            options={[...STATUS_OPTIONS]}
            error={errors?.status}
          />
          <Select
            label="Classification"
            value={value.classification ?? ""}
            onChange={(v) =>
              onChange({
                ...value,
                classification: (v || undefined) as AudienceValue["classification"],
              })
            }
            options={[...CLASSIFICATION_OPTIONS]}
            error={errors?.classification}
          />
          <Input
            label="Search"
            value={value.search ?? ""}
            onChange={(e) => onChange({ ...value, search: e.target.value || undefined })}
            placeholder="Name, email, phone…"
            leftIcon={<Search className="h-4 w-4" />}
            error={errors?.search}
          />
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-text-muted mb-3">
          <Users className="h-4 w-4" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-text-primary">Enrollment options</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label htmlFor="enrollment-customers" aria-label="Include existing customers in this campaign" className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:border-border-active transition-colors">
            <input
              id="enrollment-customers"
              type="checkbox"
              checked={value.includeCustomers !== false}
              onChange={(e) =>
                onChange({ ...value, includeCustomers: e.target.checked })
              }
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <div>
              <p className="text-sm font-medium text-text-primary">
                Include customers
              </p>
              <p className="text-xs text-text-muted">
                Backfill from the customer list in addition to leads.
              </p>
            </div>
          </label>
          <Input
            label="Max enrollments"
            type="number"
            min={1}
            max={10000}
            value={value.maxEnroll === undefined ? "" : String(value.maxEnroll)}
            onChange={(e) => {
              const n = e.target.value;
              onChange({
                ...value,
                maxEnroll: n === "" ? undefined : Number(n),
              });
            }}
            placeholder="500"
            helperText="Cap on initial backfill (1–10 000)."
            error={errors?.maxEnroll}
          />
        </div>
      </Card>

      <Card className="p-4 bg-accent/5 border-accent/20">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="h-4 w-4 text-accent" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              Audience summary
            </p>
            <p className="text-xs text-text-muted mt-1">{summary}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function buildSummary(v: AudienceValue): string {
  const parts: string[] = [];
  if (v.source) parts.push(`source = ${v.source}`);
  if (v.status) parts.push(`status = ${v.status}`);
  if (v.classification) parts.push(`${v.classification} leads`);
  if (v.search) parts.push(`matching "${v.search}"`);
  if (v.includeCustomers !== false) parts.push("including customers");
  if (v.maxEnroll) parts.push(`capped at ${v.maxEnroll}`);
  if (parts.length === 0) {
    return "No filter — all leads (and customers, if enabled) will match.";
  }
  return `Enroll records with ${parts.join(", ")}.`;
}

export const AUDIENCE_ICON: LucideIcon = Users;
