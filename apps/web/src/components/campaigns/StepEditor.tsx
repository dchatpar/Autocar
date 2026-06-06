"use client";

/**
 * StepEditor — the centerpiece of the wizard "Steps" step.
 *
 * Renders the ordered list of CampaignStep with per-step cards. The
 * editor supports all 7 step types (EMAIL, SMS, WAIT, BRANCH,
 * WEBHOOK, TASK, EXIT) and exposes:
 *   - add / remove / reorder
 *   - duplicate
 *   - inline editing
 *   - "move up / down" buttons
 *   - chip with the available {{variables}} cheatsheet for email /
 *     sms / task bodies
 *
 * Reordering uses dnd-kit (already in the project deps) for an
 * accessible keyboard-first drag experience.
 */

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Mail,
  MessageSquare,
  Clock,
  GitBranch,
  Webhook,
  CheckSquare,
  LogOut,
  Plus,
  Trash2,
  GripVertical,
  Copy,
  ChevronUp,
  ChevronDown,
  Info,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  CampaignBranchCondition,
  CampaignStepInput,
  CampaignStepType,
} from "@/types/api";

/* ------------------------------------------------------------------ */
/* Constants — defaults + metadata                                     */
/* ------------------------------------------------------------------ */

const STEP_TYPE_META: Record<
  CampaignStepType,
  { label: string; icon: LucideIcon; tone: "info" | "warning" | "accent" | "muted" | "success" | "danger" }
> = {
  EMAIL: { label: "Email", icon: Mail, tone: "info" },
  SMS: { label: "SMS", icon: MessageSquare, tone: "info" },
  WAIT: { label: "Wait", icon: Clock, tone: "warning" },
  BRANCH: { label: "Branch", icon: GitBranch, tone: "accent" },
  WEBHOOK: { label: "Webhook", icon: Webhook, tone: "muted" },
  TASK: { label: "Task", icon: CheckSquare, tone: "success" },
  EXIT: { label: "Exit", icon: LogOut, tone: "danger" },
};

const VARIABLES: ReadonlyArray<{ token: string; description: string }> = [
  { token: "{{first_name}}", description: "Recipient's first name" },
  { token: "{{last_name}}", description: "Recipient's last name" },
  { token: "{{full_name}}", description: "First + last" },
  { token: "{{email}}", description: "Email address" },
  { token: "{{phone}}", description: "Phone (E.164)" },
  { token: "{{dealership_name}}", description: "Your dealership" },
  { token: "{{agent_name}}", description: "Assigned rep" },
  { token: "{{unsubscribe_url}}", description: "Unsubscribe link" },
];

const STEP_TYPE_OPTIONS: ReadonlyArray<{ value: CampaignStepType; label: string }> = [
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
  { value: "WAIT", label: "Wait" },
  { value: "BRANCH", label: "Branch" },
  { value: "WEBHOOK", label: "Webhook" },
  { value: "TASK", label: "Task" },
  { value: "EXIT", label: "Exit" },
];

/* ------------------------------------------------------------------ */
/* Top-level component                                                 */
/* ------------------------------------------------------------------ */

interface StepEditorProps {
  steps: CampaignStepInput[];
  onChange: (steps: CampaignStepInput[]) => void;
  errors?: Record<string, string>;
}

export function StepEditor({ steps, onChange, errors }: StepEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const updateAt = useCallback(
    (idx: number, patch: Partial<CampaignStepInput>) => {
      onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    },
    [steps, onChange],
  );

  const removeAt = useCallback(
    (idx: number) => {
      onChange(steps.filter((_, i) => i !== idx));
    },
    [steps, onChange],
  );

  const duplicateAt = useCallback(
    (idx: number) => {
      const next = [...steps];
      const copy: CampaignStepInput = { ...steps[idx], name: `${steps[idx].name} (copy)` };
      next.splice(idx + 1, 0, copy);
      onChange(next);
    },
    [steps, onChange],
  );

  const moveUp = useCallback(
    (idx: number) => {
      if (idx === 0) return;
      onChange(arrayMove(steps, idx, idx - 1));
    },
    [steps, onChange],
  );

  const moveDown = useCallback(
    (idx: number) => {
      if (idx === steps.length - 1) return;
      onChange(arrayMove(steps, idx, idx + 1));
    },
    [steps, onChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIdx = steps.findIndex((_, i) => `step-${i}` === active.id);
      const toIdx = steps.findIndex((_, i) => `step-${i}` === over.id);
      if (fromIdx === -1 || toIdx === -1) return;
      onChange(arrayMove(steps, fromIdx, toIdx));
    },
    [steps, onChange],
  );

  const appendStep = useCallback(
    (type: CampaignStepType) => {
      onChange([...steps, makeDefaultStep(type, steps.length)]);
    },
    [steps, onChange],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {steps.length === 0
            ? "Add at least one step to continue."
            : `${steps.length} step${steps.length === 1 ? "" : "s"} — drag to reorder.`}
        </p>
        <AddStepMenu onAdd={appendStep} />
      </div>

      {steps.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={steps.map((_, i) => `step-${i}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <SortableStep
                  key={`step-${idx}`}
                  id={`step-${idx}`}
                  index={idx}
                  step={step}
                  totalSteps={steps.length}
                  onChange={(patch) => updateAt(idx, patch)}
                  onRemove={() => removeAt(idx)}
                  onDuplicate={() => duplicateAt(idx)}
                  onMoveUp={() => moveUp(idx)}
                  onMoveDown={() => moveDown(idx)}
                  onTypeChange={(type) => {
                    // When the type changes, replace the step body with the new defaults.
                    onChange([
                      ...steps.slice(0, idx),
                      makeDefaultStep(type, idx, { name: step.name }),
                      ...steps.slice(idx + 1),
                    ]);
                  }}
                  error={errors?.[`steps.${idx}`]}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add-step dropdown                                                   */
/* ------------------------------------------------------------------ */

function AddStepMenu({ onAdd }: { onAdd: (t: CampaignStepType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        size="sm"
        variant="primary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus className="h-4 w-4" />
        <span>Add step</span>
      </Button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            tabIndex={-1}
          />
          <div
            className="absolute right-0 z-40 mt-1 w-56 rounded-lg border border-border bg-bg-card shadow-xl overflow-hidden"
            role="menu"
          >
            {STEP_TYPE_OPTIONS.map((opt) => {
              const meta = STEP_TYPE_META[opt.value];
              const Icon = meta.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAdd(opt.value);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-elevated transition-colors"
                >
                  <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sortable step card                                                  */
/* ------------------------------------------------------------------ */

interface SortableStepProps {
  id: string;
  index: number;
  step: CampaignStepInput;
  totalSteps: number;
  onChange: (patch: Partial<CampaignStepInput>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onTypeChange: (t: CampaignStepType) => void;
  error?: string;
}

function SortableStep(props: SortableStepProps) {
  const { id, index, step, totalSteps, onChange, onRemove, onDuplicate, onMoveUp, onMoveDown, onTypeChange, error } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const meta = STEP_TYPE_META[step.stepType];
  const Icon = meta.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border border-border bg-bg-card overflow-hidden",
        isDragging && "opacity-70 ring-2 ring-accent",
        error && "border-danger",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-elevated/50 border-b border-border">
        <button
          type="button"
          className="text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing p-1"
          aria-label={`Reorder step ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <Badge variant={meta.tone} className="text-[10px]">
          <Icon className="h-3 w-3 mr-1" aria-hidden="true" />
          {meta.label}
        </Badge>
        <span className="text-xs text-text-muted">
          Step {index + 1} of {totalSteps}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton onClick={onMoveUp} disabled={index === 0} label="Move up">
            <ChevronUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            onClick={onMoveDown}
            disabled={index === totalSteps - 1}
            label="Move down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton onClick={onDuplicate} label="Duplicate step">
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            onClick={onRemove}
            label="Remove step"
            tone="danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-2">
            <Input
              value={step.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Step name (e.g. 'Welcome email')"
              aria-label="Step name"
            />
          </div>
          <Select
            value={step.stepType}
            onChange={(v) => onTypeChange(v as CampaignStepType)}
            options={[...STEP_TYPE_OPTIONS]}
            aria-label="Step type"
          />
        </div>

        <StepBodyFields step={step} onChange={onChange} totalSteps={totalSteps} />

        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  label,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "h-7 w-7 inline-flex items-center justify-center rounded transition-colors",
        "hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed",
        tone === "danger" ? "text-text-muted hover:text-danger" : "text-text-muted hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Per-type body fields                                                */
/* ------------------------------------------------------------------ */

function StepBodyFields({
  step,
  onChange,
  totalSteps,
}: {
  step: CampaignStepInput;
  onChange: (patch: Partial<CampaignStepInput>) => void;
  totalSteps: number;
}) {
  switch (step.stepType) {
    case "EMAIL":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              label="From address (optional)"
              type="email"
              value={step.fromAddress ?? ""}
              onChange={(e) => onChange({ fromAddress: e.target.value || undefined })}
              placeholder="sales@dealership.com"
            />
            <Input
              label="Subject"
              value={step.subject ?? ""}
              onChange={(e) => onChange({ subject: e.target.value })}
              placeholder="Welcome to {{dealership_name}}!"
            />
          </div>
          <TemplateEditor
            value={step.template ?? ""}
            onChange={(v) => onChange({ template: v })}
            rows={8}
            placeholder="Hi {{first_name}},&#10;&#10;Thanks for stopping by…"
            label="Body"
          />
        </div>
      );

    case "SMS":
      return (
        <TemplateEditor
          value={step.template ?? ""}
          onChange={(v) => onChange({ template: v })}
          rows={4}
          placeholder="Hi {{first_name}}, this is a reminder about your test drive tomorrow."
          label="Message"
        />
      );

    case "WAIT":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            label="Wait (hours)"
            type="number"
            min={1}
            max={720}
            value={step.waitHours === undefined ? "" : String(step.waitHours)}
            onChange={(e) => {
              const n = e.target.value;
              onChange({ waitHours: n === "" ? undefined : Number(n) });
            }}
            helperText="1–720 hours (max 30 days)"
          />
          <label className="flex items-center gap-2 mt-6 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={step.skipWeekends ?? false}
              onChange={(e) => onChange({ skipWeekends: e.target.checked })}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <span>Skip on weekends</span>
          </label>
        </div>
      );

    case "BRANCH":
      return <BranchEditor step={step} onChange={onChange} totalSteps={totalSteps} />;

    case "WEBHOOK":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select
              label="Method"
              value={step.webhookMethod ?? "POST"}
              onChange={(v) => onChange({ webhookMethod: v as CampaignStepInput["webhookMethod"] })}
              options={[
                { value: "GET", label: "GET" },
                { value: "POST", label: "POST" },
                { value: "PUT", label: "PUT" },
                { value: "PATCH", label: "PATCH" },
              ]}
            />
            <Input
              label="URL"
              type="url"
              value={step.webhookUrl ?? ""}
              onChange={(e) => onChange({ webhookUrl: e.target.value })}
              placeholder="https://hooks.dealership.com/campaign"
              className="sm:col-span-2"
            />
          </div>
          <TemplateEditor
            value={step.template ?? ""}
            onChange={(v) => onChange({ template: v })}
            rows={3}
            placeholder='{"enrollmentId": "{{enrollmentId}}"}'
            label="Body (optional)"
            showVariableChips={false}
          />
        </div>
      );

    case "TASK":
      return (
        <div className="space-y-2">
          <Input
            label="Task subject"
            value={step.subject ?? ""}
            onChange={(e) => onChange({ subject: e.target.value })}
            placeholder="Follow up with {{first_name}}"
          />
          <TemplateEditor
            value={step.template ?? ""}
            onChange={(v) => onChange({ template: v })}
            rows={3}
            placeholder="Reach out regarding their interest in the RAV4."
            label="Task notes"
          />
        </div>
      );

    case "EXIT":
      return (
        <p className="text-xs text-text-muted">
          This step ends the enrollment gracefully. The lead is marked as
          <code className="mx-1 px-1.5 py-0.5 rounded bg-bg-elevated">EXITED</code>
          in the timeline.
        </p>
      );

    default: {
      const _x: never = step.stepType;
      void _x;
      return null;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Branch editor                                                       */
/* ------------------------------------------------------------------ */

function BranchEditor({
  step,
  onChange,
  totalSteps,
}: {
  step: CampaignStepInput;
  onChange: (patch: Partial<CampaignStepInput>) => void;
  totalSteps: number;
}) {
  const cfg: CampaignBranchCondition = step.branchConfig ?? {
    field: "score",
    op: "gte",
    value: 60,
    thenStep: 0,
    elseStep: 0,
  };
  const update = (patch: Partial<CampaignBranchCondition>) =>
    onChange({ branchConfig: { ...cfg, ...patch } });

  const stepOptions = useMemo(
    (): Array<{ value: string; label: string }> =>
      Array.from({ length: totalSteps }, (_, i) => ({
        value: String(i),
        label: `Step ${i + 1}`,
      })),
    [totalSteps],
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Input
          label="Field"
          value={cfg.field}
          onChange={(e) => update({ field: e.target.value })}
          placeholder="score"
        />
        <Select
          label="Operator"
          value={cfg.op}
          onChange={(v) => update({ op: v as CampaignBranchCondition["op"] })}
          options={[
            { value: "eq", label: "=" },
            { value: "neq", label: "≠" },
            { value: "gt", label: ">" },
            { value: "gte", label: "≥" },
            { value: "lt", label: "<" },
            { value: "lte", label: "≤" },
            { value: "contains", label: "contains" },
            { value: "not_contains", label: "not contains" },
            { value: "exists", label: "exists" },
            { value: "not_exists", label: "not exists" },
          ]}
        />
        {!["exists", "not_exists"].includes(cfg.op) && (
          <Input
            label="Value"
            value={cfg.value === undefined ? "" : String(cfg.value)}
            onChange={(e) => {
              const raw = e.target.value;
              const num = Number(raw);
              update({
                value: !Number.isNaN(num) && raw.trim() !== "" && String(num) === raw.trim() ? num : raw,
              });
            }}
            placeholder="60"
          />
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Select
          label="If true, jump to"
          value={String(cfg.thenStep)}
          onChange={(v) => update({ thenStep: Number(v) })}
          options={stepOptions}
        />
        <Select
          label="If false, jump to"
          value={String(cfg.elseStep)}
          onChange={(v) => update({ elseStep: Number(v) })}
          options={stepOptions}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Template editor — body with chip-injectable variable chips          */
/* ------------------------------------------------------------------ */

function TemplateEditor({
  value,
  onChange,
  placeholder,
  rows = 6,
  label,
  showVariableChips = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  showVariableChips?: boolean;
}) {
  const [showVars, setShowVars] = useState(false);
  const insert = (token: string) => {
    onChange(`${value}${value.endsWith("\n") || value === "" ? "" : " "}${token}`);
  };
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-text-primary">
            {label}
          </label>
          {showVariableChips && (
            <button
              type="button"
              onClick={() => setShowVars((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
              aria-expanded={showVars}
            >
              <Info className="h-3.5 w-3.5" />
              {showVars ? "Hide variables" : "Insert variable"}
            </button>
          )}
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary font-mono",
          "placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none",
          "resize-y min-h-[80px]",
        )}
        aria-label={label ?? "Template body"}
      />
      {showVars && showVariableChips && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {VARIABLES.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => insert(v.token)}
              title={v.description}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-bg-elevated border border-border hover:border-accent/50 hover:text-accent transition-colors"
            >
              <code className="font-mono">{v.token}</code>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowVars(false)}
            className="text-[11px] text-text-muted hover:text-text-primary inline-flex items-center gap-1 ml-1"
            aria-label="Hide variables"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

function makeDefaultStep(
  type: CampaignStepType,
  idx: number,
  override: Partial<CampaignStepInput> = {},
): CampaignStepInput {
  const base: CampaignStepInput = {
    name: `Step ${idx + 1}`,
    stepType: type,
  };
  switch (type) {
    case "EMAIL":
      return {
        ...base,
        name: "Welcome email",
        subject: "Welcome to {{dealership_name}}",
        template:
          "Hi {{first_name}},\n\nThanks for your interest. We&apos;ll be in touch shortly.\n\n— The team at {{dealership_name}}\n\n{{unsubscribe_url}}",
        fromAddress: undefined,
      };
    case "SMS":
      return {
        ...base,
        name: "Quick follow-up",
        template:
          "Hi {{first_name}}, just checking in about your interest. Reply STOP to opt out.",
      };
    case "WAIT":
      return { ...base, name: "Wait 1 day", waitHours: 24 };
    case "BRANCH":
      return {
        ...base,
        name: "If hot lead",
        branchConfig: { field: "score", op: "gte", value: 60, thenStep: idx, elseStep: idx + 1 },
      };
    case "WEBHOOK":
      return {
        ...base,
        name: "Notify Slack",
        webhookUrl: "https://hooks.slack.com/services/...",
        webhookMethod: "POST",
      };
    case "TASK":
      return {
        ...base,
        name: "Follow-up task",
        subject: "Follow up with {{first_name}}",
        template: "Reach out regarding their interest.",
      };
    case "EXIT":
      return { ...base, name: "End of sequence" };
    default: {
      const _x: never = type;
      void _x;
      return base;
    }
  }
}
