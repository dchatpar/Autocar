"use client";

/**
 * /campaigns/[id]/edit — edit a campaign using the same 5-step wizard.
 *
 * Reuses the components from /campaigns/new. We hydrate the wizard
 * from the existing campaign row, then call useUpdateCampaign on
 * submit.
 *
 * The wizard's autosave (localStorage) is intentionally disabled
 * here so we don't fight the API's authoritative state.
 */

import { useCallback, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Inbox } from "lucide-react";

import { Wizard, type WizardStepDef2 } from "@/components/common/Wizard";
import { useWizardValidation } from "@/hooks/useWizardValidation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";

import { TriggerPicker } from "@/components/campaigns/TriggerPicker";
import { AudienceBuilder, type AudienceValue } from "@/components/campaigns/AudienceBuilder";
import { StepEditor } from "@/components/campaigns/StepEditor";

import {
  useCampaign,
  useUpdateCampaign,
  campaignKeys,
} from "@/hooks/useCampaigns";
import type { CampaignTriggerType, CampaignStepInput } from "@/types/api";
import { CAMPAIGN_INITIAL, type CampaignFormData } from "../new/campaign-data";

/* ------------------------------------------------------------------ */
/* Per-step validation schemas (mirror new/page.tsx)                   */
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
      }),
    )
    .min(1, "Add at least one step"),
});
const step5Schema = z.object({
  steps: z.array(z.unknown()).min(1),
});

export default function EditCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const { data: campaign, isLoading, isError } = useCampaign(id);
  const update = useUpdateCampaign(id);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Hydrate the wizard from the server state.
  const initial = useMemo<CampaignFormData>(() => {
    if (!campaign) return CAMPAIGN_INITIAL;
    return {
      name: campaign.name,
      description: campaign.description ?? "",
      triggerType: campaign.triggerType as CampaignTriggerType,
      triggerConfig: (campaign.triggerConfig ?? {}) as Record<string, unknown>,
      audience: (campaign.audience ?? {}) as AudienceValue,
      steps: campaign.steps.map((s) => ({
        stepType: s.stepType,
        name: s.name,
        template: s.template ?? undefined,
        subject: s.subject ?? undefined,
        waitHours: s.waitHours ?? undefined,
        branchConfig: s.branchConfig
          ? (s.branchConfig as unknown as CampaignFormData["steps"][number]["branchConfig"])
          : undefined,
        webhookUrl: s.webhookUrl ?? undefined,
        webhookMethod: s.webhookMethod as CampaignStepInput["webhookMethod"],
        taskAssignToId: s.taskAssignToId ?? undefined,
        fromAddress: s.fromAddress ?? undefined,
        skipWeekends: s.skipWeekends,
        metadata: s.metadata,
      })),
    };
  }, [campaign]);

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
        description: "Update the title and description.",
        component: Step1Name,
        validate: validation.validate.step1,
        validateErrors: validation.errors.step1,
      },
      {
        id: "trigger",
        title: "Trigger",
        description: "Update the trigger and its config.",
        component: Step2Trigger,
        validate: validation.validate.step2,
        validateErrors: validation.errors.step2,
      },
      {
        id: "audience",
        title: "Audience",
        description: "Refine the audience filter.",
        component: Step3Audience,
        validate: validation.validate.step3,
        validateErrors: validation.errors.step3,
        optional: true,
      },
      {
        id: "steps",
        title: "Steps",
        description: "Reorder, edit, or remove steps.",
        component: Step4Steps,
        validate: validation.validate.step4,
        validateErrors: validation.errors.step4,
      },
      {
        id: "review",
        title: "Review",
        description: "Sanity check and save the changes.",
        component: Step5Review,
        validate: validation.validate.step5,
        validateErrors: validation.errors.step5,
      },
    ],
    [validation.validate, validation.errors],
  );

  const handleComplete = useCallback(
    async (data: CampaignFormData) => {
      if (!data.triggerType) return;
      try {
        const result = await update.mutateAsync({
          id,
          input: {
            name: data.name,
            description: data.description || undefined,
            triggerType: data.triggerType,
            triggerConfig: data.triggerConfig,
            audience: data.audience as Record<string, unknown>,
            steps: data.steps,
          },
        });
        await qc.invalidateQueries({ queryKey: campaignKeys.detail(result.id) });
        router.push(`/campaigns/${id}?saved=1`);
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Failed to save campaign.",
        );
      }
    },
    [id, router, update, qc],
  );

  if (isError) {
    return (
      <EmptyState
        title="Couldn't load campaign"
        description="It may have been deleted or you may not have access."
        primaryAction={{ label: "Back to campaigns", onClick: () => router.push("/campaigns") }}
      />
    );
  }
  if (isLoading || !campaign) {
    return (
      <>
        <div className="space-y-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  return (
    <Wizard<CampaignFormData>
      steps={steps}
      initialData={initial}
      title={`Edit "${campaign.name}"`}
      description="Make changes and save. Existing enrollments continue to run with the new step list."
      submitLabel="Save changes"
      onComplete={handleComplete}
      maxWidth="2xl"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Per-step components (local copies for type-safety)                  */
/* ------------------------------------------------------------------ */

function Step1Name({ data, update, errors }: { data: CampaignFormData; update: (p: Partial<CampaignFormData>) => void; errors: Record<string, string>; isFirstStep: boolean; isLastStep: boolean }) {
  return (
    <div className="space-y-4">
      <Input
        label="Campaign name"
        value={data.name}
        onChange={(e) => update({ name: e.target.value })}
        error={errors.name}
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
          className="mt-1.5 w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        />
        <p className="text-xs text-text-muted mt-1">
          {data.description.length} / 2000 characters
        </p>
      </div>
    </div>
  );
}

function Step2Trigger({ data, update, errors }: { data: CampaignFormData; update: (p: Partial<CampaignFormData>) => void; errors: Record<string, string>; isFirstStep: boolean; isLastStep: boolean }) {
  return (
    <TriggerPicker
      value={data.triggerType}
      onChange={(v) => update({ triggerType: v, triggerConfig: {} })}
      config={data.triggerConfig}
      onConfigChange={(c) => update({ triggerConfig: c })}
      errors={errors}
    />
  );
}

function Step3Audience({ data, update, errors }: { data: CampaignFormData; update: (p: Partial<CampaignFormData>) => void; errors: Record<string, string>; isFirstStep: boolean; isLastStep: boolean }) {
  return (
    <AudienceBuilder
      value={data.audience}
      onChange={(v) => update({ audience: v })}
      errors={errors}
    />
  );
}

function Step4Steps({ data, update, errors }: { data: CampaignFormData; update: (p: Partial<CampaignFormData>) => void; errors: Record<string, string>; isFirstStep: boolean; isLastStep: boolean }) {
  return (
    <StepEditor
      steps={data.steps}
      onChange={(s) => update({ steps: s })}
      errors={errors}
    />
  );
}

function Step5Review({ data }: { data: CampaignFormData; update: (p: Partial<CampaignFormData>) => void; errors: Record<string, string>; isFirstStep: boolean; isLastStep: boolean }) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-text-muted font-medium">
          Basics
        </p>
        <h3 className="text-lg font-semibold text-text-primary mt-1">
          {data.name}
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
        <div className="mt-2">
          <Badge variant="info">{data.triggerType ?? "Not set"}</Badge>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-text-muted font-medium mb-3">
          Steps ({data.steps.length})
        </p>
        <ol className="space-y-2">
          {data.steps.map((s, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 p-2 rounded border border-border"
            >
              <span className="text-xs text-text-muted font-mono w-6 text-right">
                {idx + 1}
              </span>
              <Badge variant="muted" className="text-[10px]">
                {s.stepType}
              </Badge>
              <p className="text-sm font-medium text-text-primary">{s.name}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="p-4 bg-info/5 border-info/20">
        <div className="flex items-start gap-3">
          <Inbox className="h-5 w-5 text-info mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-text-primary">
              Active enrollments keep running
            </p>
            <p className="text-xs text-text-muted mt-1">
              Changing the step list does not interrupt in-flight enrollments.
              They will continue from their current cursor and pick up new
              steps on their next cycle.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
