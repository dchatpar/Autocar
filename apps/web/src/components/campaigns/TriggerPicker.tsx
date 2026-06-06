"use client";

/**
 * TriggerPicker — selectable grid of campaign trigger types.
 *
 * Used in the wizard "Trigger" step. The picker is split into three
 * groups for visual clarity:
 *   - Lead lifecycle (LEAD_CREATED, LEAD_UPDATED, STATUS_CHANGE, …)
 *   - Engagement (APPOINTMENT, DEAL_STAGE, SCORE_CHANGE, …)
 *   - Time-based (NO_ACTIVITY, BIRTHDAY, …)
 *   - Custom (MANUAL, API)
 *
 * Once a trigger is picked, the optional `renderConfig` callback
 * renders the per-trigger config editor (e.g. { from: "NEW", to: "CONTACTED" }
 * for STATUS_CHANGE).
 */

import { useMemo } from "react";
import {
  UserCheck,
  Activity,
  BarChart3,
  Calendar,
  Trophy,
  Zap,
  Tag,
  Users,
  Code2,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CampaignTriggerType } from "@/types/api";

interface TriggerOption {
  type: CampaignTriggerType;
  label: string;
  description: string;
  icon: LucideIcon;
  configFields?: ReadonlyArray<ConfigField>;
  recommended?: boolean;
}

interface ConfigField {
  name: string;
  label: string;
  type: "text" | "number" | "select";
  options?: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
}

const OPTIONS: ReadonlyArray<TriggerOption> = [
  {
    type: "LEAD_CREATED",
    label: "New lead",
    description: "Enroll every lead the moment it enters the CRM.",
    icon: UserCheck,
    recommended: true,
  },
  {
    type: "STATUS_CHANGE",
    label: "Status change",
    description: "Trigger on a specific status transition (e.g. NEW → CONTACTED).",
    icon: BarChart3,
    configFields: [
      { name: "from", label: "From status", type: "text", placeholder: "NEW (any)" },
      { name: "to", label: "To status", type: "text", placeholder: "CONTACTED" },
    ],
  },
  {
    type: "LEAD_UPDATED",
    label: "Lead updated",
    description: "Fire on any lead update (field-level filter optional).",
    icon: Activity,
  },
  {
    type: "NO_ACTIVITY",
    label: "No activity",
    description: "Re-engage leads that haven&apos;t been contacted in N days.",
    icon: Activity,
    configFields: [
      { name: "days", label: "Days of inactivity", type: "number", placeholder: "14" },
    ],
  },
  {
    type: "APPOINTMENT",
    label: "Appointment",
    description: "Trigger when an appointment is booked or completed.",
    icon: Calendar,
    configFields: [
      {
        name: "type",
        label: "Type",
        type: "select",
        options: [
          { value: "", label: "Any" },
          { value: "SALES", label: "Sales" },
          { value: "TEST_DRIVE", label: "Test drive" },
          { value: "SERVICE", label: "Service" },
          { value: "DELIVERY", label: "Delivery" },
        ],
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "", label: "Any" },
          { value: "SCHEDULED", label: "Scheduled" },
          { value: "CONFIRMED", label: "Confirmed" },
          { value: "COMPLETED", label: "Completed" },
          { value: "CANCELLED", label: "Cancelled" },
          { value: "NO_SHOW", label: "No show" },
        ],
      },
    ],
  },
  {
    type: "DEAL_STAGE",
    label: "Deal stage",
    description: "Trigger on a deal moving into a specific stage.",
    icon: Trophy,
    configFields: [
      { name: "stage", label: "Stage", type: "text", placeholder: "DELIVERED" },
    ],
  },
  {
    type: "SCORE_CHANGE",
    label: "Score change",
    description: "When a lead&apos;s classification changes to cold / warm / hot.",
    icon: Zap,
    configFields: [
      {
        name: "classification",
        label: "Classification",
        type: "select",
        options: [
          { value: "hot", label: "Hot (61+)" },
          { value: "warm", label: "Warm (31-60)" },
          { value: "cold", label: "Cold (0-30)" },
        ],
      },
    ],
  },
  {
    type: "BIRTHDAY",
    label: "Birthday",
    description: "Send a greeting N days before a customer&apos;s birthday.",
    icon: Calendar,
    configFields: [
      { name: "daysBefore", label: "Days before", type: "number", placeholder: "7" },
    ],
  },
  {
    type: "VEHICLE_MATCH",
    label: "Vehicle match",
    description: "When a vehicle arrives that matches a lead&apos;s interest.",
    icon: Tag,
    configFields: [
      { name: "make", label: "Make", type: "text", placeholder: "Toyota" },
      { name: "model", label: "Model", type: "text", placeholder: "RAV4" },
      { name: "year", label: "Year (optional)", type: "number", placeholder: "2024" },
    ],
  },
  {
    type: "MANUAL",
    label: "Manual",
    description: "Triggered by a salesperson from the lead or customer record.",
    icon: Users,
  },
  {
    type: "API",
    label: "API",
    description: "Triggered by an external system via the public API.",
    icon: Code2,
  },
];

interface TriggerPickerProps {
  value: CampaignTriggerType | null;
  onChange: (v: CampaignTriggerType) => void;
  config: Record<string, unknown>;
  onConfigChange: (cfg: Record<string, unknown>) => void;
  errors?: Record<string, string>;
}

export function TriggerPicker({
  value,
  onChange,
  config,
  onConfigChange,
  errors,
}: TriggerPickerProps) {
  const selected = useMemo(
    () => OPTIONS.find((o) => o.type === value) ?? null,
    [value],
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = opt.type === value;
          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => onChange(opt.type)}
              className={cn(
                "text-left rounded-lg border p-4 transition-all",
                "hover:border-accent/60 hover:bg-bg-elevated/30",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                isSelected
                  ? "border-accent bg-accent/5"
                  : "border-border bg-bg-card",
              )}
              aria-pressed={isSelected}
              aria-label={`${opt.label} trigger`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
                    isSelected
                      ? "bg-accent text-bg-primary"
                      : "bg-bg-elevated text-text-muted",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-text-primary truncate">
                      {opt.label}
                    </h4>
                    {opt.recommended && (
                      <span className="inline-flex items-center text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                    {opt.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected && selected.configFields && selected.configFields.length > 0 && (
        <Card className="p-4 bg-bg-elevated/30">
          <h4 className="text-sm font-semibold text-text-primary mb-3">
            Configure {selected.label}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {selected.configFields.map((f) => (
              <ConfigFieldInput
                key={f.name}
                field={f}
                value={config[f.name]}
                onChange={(v) =>
                  onConfigChange({ ...config, [f.name]: v })
                }
                error={errors?.[f.name]}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function ConfigFieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: string | number | undefined) => void;
  error?: string;
}) {
  if (field.type === "select") {
    return (
      <Select
        label={field.label}
        value={typeof value === "string" ? value : ""}
        onChange={(v) => onChange(v || undefined)}
        options={field.options ? [...field.options] : []}
        error={error}
      />
    );
  }
  if (field.type === "number") {
    return (
      <Input
        type="number"
        label={field.label}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => {
          const n = e.target.value;
          onChange(n === "" ? undefined : Number(n));
        }}
        placeholder={field.placeholder}
        error={error}
      />
    );
  }
  return (
    <Input
      label={field.label}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={field.placeholder}
      error={error}
    />
  );
}
