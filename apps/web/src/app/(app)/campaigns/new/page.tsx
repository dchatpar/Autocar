"use client";

/**
 * /campaigns/new — 5-step wizard to create a marketing campaign.
 *
 * Steps:
 *   1. Name     — title, description
 *   2. Trigger  — pick the trigger type + per-trigger config
 *   3. Audience — filter the records that get enrolled
 *   4. Steps    — the multi-step sequence (email / SMS / wait / branch / etc.)
 *   5. Review   — sanity check + create
 *
 * Reuses the <Wizard /> component for progress / navigation / autosave.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Save, Send, Inbox } from "lucide-react";

import { Wizard, type WizardStepDef2 } from "@/components/common/Wizard";
import { useWizardValidation } from "@/hooks/useWizardValidation";
import { useCreateCampaign } from "@/hooks/useCampaigns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { TriggerPicker } from "@/components/campaigns/TriggerPicker";
import { AudienceBuilder, type AudienceValue } from "@/components/campaigns/AudienceBuilder";
import { StepEditor } from "@/components/campaigns/StepEditor";

import type {
  CampaignStepInput,
  CampaignTriggerType,
} from "@/types/api";

const STORAGE_KEY = "wizard:new-campaign:v1";

/* ------------------------------------------------------------------ */
/* Form data shape                                                     */
/* ------------------------------------------------------------------ */

export interface CampaignFormData {
  name: string;
  description: string;
  triggerType: CampaignTriggerType | null;
  triggerConfig: Record<string, unknown>;
  audience: AudienceValue;
  steps: CampaignStepInput[];
}

import { CAMPAIGN_INITIAL } from "./campaign-data";

/* ------------------------------------------------------------------ */
/* Per-step validation schemas                                         */
/* ------------------------------------------------------------------ */

const step1Schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(200),
  description: z.string().max(2000).optional(),
});

const step2Schema = z.object({
  triggerType: z.enum([
    "LEAD_CREATED",
    "LEAD_UPDATED",
    "STATUS_CHANGE",
    "NO_ACTIVITY",
    "DEAL_STAGE",
    "APPOINTMENT",
    "SCORE_CHANGE",
    "BIRTHDAY",
    "VEHICLE_MATCH",
    "MANUAL",
    "API",
  ]),
});

const step3Schema = z.object({
  audience: z.object({
    maxEnroll: z.number().int().min(1).max(10000).optional(),
    source: z.string().optional(),
    status: z.string().optional(),
    classification: z.enum(["cold", "warm", "hot"]).optional(),
  }),
});

const step4Schema = z.object({
  steps: z
    .array(
      z.object({
        stepType: z.enum([
          "EMAIL",
          "SMS",
          "WAIT",
          "BRANCH",
          "WEBHOOK",
          "TASK",
          "EXIT",
        ]),
        name: z.string().min(1),
        template: z.string().optional(),
        subject: z.string().optional(),
        waitHours: z.number().int().min(0).max(720).optional(),
      }),
    )
    .min(1, "Add at least one step"),
});

const step5Schema = z.object({
  steps: z.array(z.unknown()).min(1),
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function NewCampaignPage() {
  const router = useRouter();
  const createCampaign = useCreateCampaign();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validation = useWizardValidation<CampaignFormData>({
    step1: { schema: step1Schema, fields: ["name", "description"] },
    step2: { schema: step2Schema, fields: ["triggerType"] },
    step3: { schema: step3Schema, fields: ["audience"] },
    step4: { schema: step4Schema, fields: ["steps"] },
    step5: { schema: step5Schema, fields: ["steps"] },
  });

  const steps: WizardStepDef2<CampaignFormData>[] = useMemo(
    () => [
      {
        id: "name",
        title: "Name",
        description: "Give the campaign a clear internal name.",
        component: Step1Name,
        validate: validation.validate.step1,
        validateErrors: validation.errors.step1,
      },
      {
        id: "trigger",
        title: "Trigger",
        description: "What event enrolls a record into this campaign?",
        component: Step2Trigger,
        validate: validation.validate.step2,
        validateErrors: validation.errors.step2,
      },
      {
        id: "audience",
        title: "Audience",
        description: "Filter which records are eligible to enroll.",
        component: Step3Audience,
        validate: validation.validate.step3,
        validateErrors: validation.errors.step3,
        optional: true,
      },
      {
        id: "steps",
        title: "Steps",
        description: "Build the sequence: email, SMS, wait, branch, and more.",
        component: Step4Steps,
        validate: validation.validate.step4,
        validateErrors: validation.errors.step4,
      },
      {
        id: "review",
        title: "Review",
        description: "Sanity check and create the draft campaign.",
        component: Step5Review,
        validate: validation.validate.step5,
        validateErrors: validation.errors.step5,
      },
    ],
    [validation.validate, validation.errors],
  );

  const handleComplete = useCallback(
    async (data: CampaignFormData) => {
      if (!data.triggerType) {
        setSubmitError("Pick a trigger type on step 2.");
        return;
      }
      try {
        const created = await createCampaign.mutateAsync({
          name: data.name,
          description: data.description || undefined,
          triggerType: data.triggerType,
          triggerConfig: data.triggerConfig,
          audience: data.audience as Record<string, unknown>,
          steps: data.steps,
        });
        router.push(`/campaigns/${created.id}?created=1`);
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Failed to create campaign.",
        );
      }
    },
    [createCampaign, router],
  );

  return (
    <Wizard<CampaignFormData>
      steps={steps}
      initialData={CAMPAIGN_INITIAL}
      storageKey={STORAGE_KEY}
      title="New campaign"
      description="Five steps to build a drip sequence. Your progress auto-saves every 30 seconds."
      submitLabel="Create draft"
      onComplete={handleComplete}
      maxWidth="2xl"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Step 1 — Name                                                       */
/* ------------------------------------------------------------------ */

function Step1Name({ data, update, errors }: { data: CampaignFormData; update: (p: Partial<CampaignFormData>) => void; errors: Record<string, string>; isFirstStep: boolean; isLastStep: boolean }) {
  return (
    <div className="space-y-4">
      <Input
        label="Campaign name"
        value={data.name}
        onChange={(e) => update({ name: e.target.value })}
        placeholder="e.g. 'New lead welcome sequence'"
        error={errors.name}
        helperText="Visible in the campaigns list. Use a clear, searchable name."
        required
      />
      <div>
        <label className="text-sm font-medium text-text-primary">
          Description (optional)
        </label>
        <textarea
          value={data.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={4}
          maxLength={2000}
          placeholder="What does this campaign do? When does it run? Who's it for?"
          className="mt-1.5 w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        />
        <p className="text-xs text-text-muted mt-1">
          {data.description.length} / 2000 characters
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2 — Trigger                                                    */
/* ------------------------------------------------------------------ */

function Step2Trigger({ data, update, errors }: { data: CampaignFormData; update: (p: Partial<CampaignFormData>) => void; errors: Record<string, string>; isFirstStep: boolean; isLastStep: boolean }) {
  if (!data.triggerType) {
    return (
      <TriggerPicker
        value={null}
        onChange={(v) => update({ triggerType: v, triggerConfig: {} })}
        config={{}}
        onConfigChange={(c) => update({ triggerConfig: c })}
        errors={errors}
      />
    );
  }
  return (
    <TriggerPicker
      value={data.triggerType}
      onChange={(v) => update({ triggerType: v })}
      config={data.triggerConfig}
      onConfigChange={(c) => update({ triggerConfig: c })}
      errors={errors}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Step 3 — Audience                                                   */
/* ------------------------------------------------------------------ */

function Step3Audience({ data, update, errors }: { data: CampaignFormData; update: (p: Partial<CampaignFormData>) => void; errors: Record<string, string>; isFirstStep: boolean; isLastStep: boolean }) {
  return (
    <AudienceBuilder
      value={data.audience}
      onChange={(v) => update({ audience: v })}
      errors={errors}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Step 4 — Steps                                                      */
/* ------------------------------------------------------------------ */

function Step4Steps({ data, update, errors }: { data: CampaignFormData; update: (p: Partial<CampaignFormData>) => void; errors: Record<string, string>; isFirstStep: boolean; isLastStep: boolean }) {
  return (
    <StepEditor
      steps={data.steps}
      onChange={(s) => update({ steps: s })}
      errors={errors}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Step 5 — Review                                                     */
/* ------------------------------------------------------------------ */

function Step5Review({ data }: { data: CampaignFormData; update: (p: Partial<CampaignFormData>) => void; errors: Record<string, string>; isFirstStep: boolean; isLastStep: boolean }) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-text-muted font-medium">
          Basics
        </p>
        <h3 className="text-lg font-semibold text-text-primary mt-1">
          {data.name || <span className="text-text-muted">Untitled</span>}
        </h3>
        {data.description && (
          <p className="text-sm text-text-muted mt-1 whitespace-pre-line">
            {data.description}
          </p>
        )}
      </Card>

      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-text-muted font-medium">
          Trigger
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="info">{data.triggerType ?? "Not set"}</Badge>
          {Object.keys(data.triggerConfig).length > 0 && (
            <code className="text-xs text-text-muted font-mono">
              {JSON.stringify(data.triggerConfig)}
            </code>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-text-muted font-medium">
          Audience
        </p>
        <div className="mt-2 text-sm text-text-primary space-y-1">
          {data.audience.source && <p>Source = {data.audience.source}</p>}
          {data.audience.status && <p>Status = {data.audience.status}</p>}
          {data.audience.classification && (
            <p>Classification = {data.audience.classification}</p>
          )}
          {data.audience.search && <p>Search = {data.audience.search}</p>}
          {data.audience.includeCustomers !== false && (
            <p>Includes customers</p>
          )}
          {data.audience.maxEnroll && (
            <p>Capped at {data.audience.maxEnroll} initial enrollments</p>
          )}
          {Object.values(data.audience).every(
            (v) => v === undefined || v === true || v === 500,
          ) && (
            <p className="text-text-muted">No filter — matches everything.</p>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-text-muted font-medium mb-3">
          Steps ({data.steps.length})
        </p>
        {data.steps.length === 0 ? (
          <p className="text-sm text-text-muted">No steps yet.</p>
        ) : (
          <ol className="space-y-2">
            {data.steps.map((s, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 p-2 rounded border border-border"
              >
                <span className="text-xs text-text-muted font-mono mt-0.5 w-6 text-right">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="muted" className="text-[10px]">
                      {s.stepType}
                    </Badge>
                    <p className="text-sm font-medium text-text-primary">
                      {s.name}
                    </p>
                  </div>
                  {s.stepType === "WAIT" && s.waitHours && (
                    <p className="text-xs text-text-muted mt-1">
                      Wait {s.waitHours} hour{s.waitHours === 1 ? "" : "s"}
                    </p>
                  )}
                  {(s.stepType === "EMAIL" || s.stepType === "SMS" || s.stepType === "TASK") &&
                    s.template && (
                      <p className="text-xs text-text-muted mt-1 line-clamp-2">
                        {s.template}
                      </p>
                    )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="p-4 bg-info/5 border-info/20">
        <div className="flex items-start gap-3">
          <Inbox className="h-5 w-5 text-info mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-text-primary">
              Saving as a draft
            </p>
            <p className="text-xs text-text-muted mt-1">
              You can keep editing after creating. Activate the campaign from
              the detail page when you&apos;re ready for it to start enrolling
              leads.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
