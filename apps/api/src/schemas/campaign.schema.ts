/**
 * Zod schemas for the Marketing Campaigns API surface.
 *
 * Validation-first: every request body / query is checked before any
 * database call is made. The shapes here mirror the Prisma models
 * (Campaign, CampaignStep, CampaignEnrollment, CampaignStepExecution)
 * but are stricter — runtime values are validated and parsed to the
 * expected TypeScript shape.
 *
 * Conventions:
 *   - Bodies use `.strict()` so unknown keys return a 400 instead of
 *     being silently dropped.
 *   - Query strings use `z.coerce` for the integer / boolean casts
 *     Fastify's `req.query` always comes back as.
 *   - JSON columns (triggerConfig, audience, branchConfig) are typed
 *     loosely — they get stored as-is and re-validated at use site.
 */

import { z } from "zod";

/* ============================================================
 * Primitive enums
 * ============================================================ */

export const CampaignStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
]);

export const CampaignTriggerTypeSchema = z.enum([
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
]);

export const CampaignStepTypeSchema = z.enum([
  "EMAIL",
  "SMS",
  "WAIT",
  "BRANCH",
  "WEBHOOK",
  "TASK",
  "EXIT",
]);

export const CampaignEnrollmentStatusSchema = z.enum([
  "PENDING",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "EXITED",
  "FAILED",
]);

export const CampaignStepExecutionStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "SENT",
  "DELIVERED",
  "SKIPPED",
  "FAILED",
]);

/* ============================================================
 * Param / query schemas
 * ============================================================ */

export const CampaignIdParamsSchema = z.object({
  id: z.string().min(1).max(64),
});

export const EnrollmentIdParamsSchema = z.object({
  id: z.string().min(1).max(64),
});

export const ListCampaignsQuerySchema = z.object({
  status: CampaignStatusSchema.optional(),
  triggerType: CampaignTriggerTypeSchema.optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).max(128).optional(),
});

export const ListEnrollmentsQuerySchema = z.object({
  status: CampaignEnrollmentStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).max(128).optional(),
});

export const CampaignStatsQuerySchema = z.object({
  /** Look-back window in days for "recent" metrics. Default 30. */
  days: z.coerce.number().int().min(1).max(365).default(30),
});

/* ============================================================
 * Trigger / audience config
 * ============================================================ */

/**
 * Free-form JSON. The trigger service knows how to interpret each
 * shape per `triggerType`. We accept any object and narrow per use.
 */
export const TriggerConfigSchema = z
  .object({
    /** STATUS_CHANGE: { from: "NEW", to: "CONTACTED" } */
    from: z.string().max(40).optional(),
    to: z.string().max(40).optional(),
    /** NO_ACTIVITY: { days: 14 } */
    days: z.number().int().min(1).max(365).optional(),
    /** DEAL_STAGE: { stage: "DELIVERED" } */
    stage: z.string().max(40).optional(),
    /** APPOINTMENT: { type: "TEST_DRIVE", status: "COMPLETED" } */
    type: z.string().max(40).optional(),
    /** SCORE_CHANGE: { classification: "hot" } */
    classification: z.enum(["cold", "warm", "hot"]).optional(),
    /** VEHICLE_MATCH: { make, model, year? } */
    make: z.string().max(60).optional(),
    model: z.string().max(60).optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    /** BIRTHDAY: { daysBefore: 7 } */
    daysBefore: z.number().int().min(0).max(60).optional(),
  })
  .strict()
  .default({});

/**
 * Audience filter — same shape as the Lead list filter. Used both for
 * the initial enrollment gate (only auto-enroll matching leads) and
 * for "backfill" runs of a manual campaign.
 */
export const AudienceFilterSchema = z
  .object({
    source: z.string().max(80).optional(),
    status: z.string().max(40).optional(),
    classification: z.enum(["cold", "warm", "hot"]).optional(),
    assignedTo: z.string().max(64).optional(),
    /** Free-form search across name / email / phone. */
    search: z.string().max(200).optional(),
    /** Include customers in addition to leads. Default true. */
    includeCustomers: z.boolean().default(true),
    /** Cap on initial enrollment for a manual campaign. */
    maxEnroll: z.number().int().min(1).max(10000).default(500),
  })
  .strict()
  .default({});

/* ============================================================
 * Step definitions
 * ============================================================ */

const BranchConditionSchema = z
  .object({
    /** Field name on the lead/customer to evaluate. */
    field: z.string().min(1).max(80),
    op: z.enum([
      "eq",
      "neq",
      "gt",
      "gte",
      "lt",
      "lte",
      "contains",
      "not_contains",
      "exists",
      "not_exists",
    ]),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    /** Index of the step to jump to when the condition is true. */
    thenStep: z.number().int().min(0).max(500),
    /** Index of the step to jump to when the condition is false. */
    elseStep: z.number().int().min(0).max(500),
  })
  .strict();

const BaseStepFields = {
  name: z.string().min(1).max(120),
  template: z.string().max(8000).optional(),
  subject: z.string().max(500).optional(),
  waitHours: z.number().int().min(0).max(24 * 30).optional(),
  branchConfig: BranchConditionSchema.optional(),
  webhookUrl: z.string().url().max(2000).optional(),
  webhookMethod: z.enum(["GET", "POST", "PUT", "PATCH"]).optional(),
  taskAssignToId: z.string().min(1).max(64).optional(),
  fromAddress: z.string().email().max(254).optional(),
  skipWeekends: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
};

export const CampaignStepInputSchema = z
  .discriminatedUnion("stepType", [
    z
      .object({
        stepType: z.literal("EMAIL"),
        ...BaseStepFields,
        subject: z.string().min(1).max(500),
        template: z.string().min(1).max(8000),
        fromAddress: z.string().email().optional(),
      })
      .strict(),
    z
      .object({
        stepType: z.literal("SMS"),
        ...BaseStepFields,
        template: z.string().min(1).max(1600),
      })
      .strict(),
    z
      .object({
        stepType: z.literal("WAIT"),
        ...BaseStepFields,
        waitHours: z.number().int().min(1).max(24 * 30),
        skipWeekends: z.boolean().optional(),
      })
      .strict(),
    z
      .object({
        stepType: z.literal("BRANCH"),
        ...BaseStepFields,
        branchConfig: BranchConditionSchema,
      })
      .strict(),
    z
      .object({
        stepType: z.literal("WEBHOOK"),
        ...BaseStepFields,
        webhookUrl: z.string().url(),
        webhookMethod: z
          .enum(["GET", "POST", "PUT", "PATCH"])
          .default("POST"),
        template: z.string().max(8000).optional(),
      })
      .strict(),
    z
      .object({
        stepType: z.literal("TASK"),
        ...BaseStepFields,
        taskAssignToId: z.string().min(1).max(64).optional(),
        template: z.string().min(1).max(2000),
        subject: z.string().min(1).max(200).optional(),
      })
      .strict(),
    z
      .object({
        stepType: z.literal("EXIT"),
        ...BaseStepFields,
      })
      .strict(),
  ]);

export const CampaignStepUpdateSchema = CampaignStepInputSchema;

/* ============================================================
 * Body schemas — create / update campaign
 * ============================================================ */

export const CreateCampaignBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    triggerType: CampaignTriggerTypeSchema,
    triggerConfig: TriggerConfigSchema.optional(),
    audience: AudienceFilterSchema.optional(),
    steps: z.array(CampaignStepInputSchema).min(1).max(50),
  })
  .strict();

export const UpdateCampaignBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    triggerType: CampaignTriggerTypeSchema.optional(),
    triggerConfig: TriggerConfigSchema.optional(),
    audience: AudienceFilterSchema.optional(),
    /**
     * If provided, the entire step list is replaced. We use full-
     * replace semantics so the UI's drag-to-reorder works without
     * tracking per-step IDs. Optional — when omitted, only the
     * scalar fields above are updated.
     */
    steps: z.array(CampaignStepInputSchema).min(0).max(50).optional(),
  })
  .strict();

export const EnrollLeadsBodySchema = z
  .object({
    leadIds: z.array(z.string().min(1).max(64)).min(1).max(500).optional(),
    customerIds: z
      .array(z.string().min(1).max(64))
      .min(1)
      .max(500)
      .optional(),
    /**
     * When true, backfill using the campaign's `audience` filter
     * (e.g. "all hot leads"). Combined with the leadIds / customerIds
     * arrays when both are set.
     */
    useAudience: z.boolean().default(false),
    /** When true, replace any existing in-flight enrollments for the
     *  same (campaign, lead/customer) — otherwise skip duplicates. */
    replace: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) =>
      Boolean(v.leadIds?.length) ||
      Boolean(v.customerIds?.length) ||
      v.useAudience === true,
    {
      message:
        "Provide leadIds, customerIds, or set useAudience=true to backfill.",
    },
  );

export const UnenrollBodySchema = z
  .object({
    reason: z.string().min(1).max(200).optional(),
  })
  .strict()
  .default({});

/* ============================================================
 * Response shapes
 * ============================================================ */

export const CampaignSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: CampaignStatusSchema,
  triggerType: CampaignTriggerTypeSchema,
  enrolledCount: z.number().int().min(0),
  activeCount: z.number().int().min(0),
  completedCount: z.number().int().min(0),
  exitedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  activatedAt: z.string().nullable(),
  pausedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  stepCount: z.number().int().min(0),
});

export const CampaignStepResponseSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  order: z.number().int().min(0),
  name: z.string(),
  stepType: CampaignStepTypeSchema,
  template: z.string().nullable(),
  subject: z.string().nullable(),
  waitHours: z.number().int().nullable(),
  branchConfig: z.record(z.unknown()).nullable(),
  webhookUrl: z.string().nullable(),
  webhookMethod: z.string().nullable(),
  taskAssignToId: z.string().nullable(),
  fromAddress: z.string().nullable(),
  skipWeekends: z.boolean(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CampaignDetailSchema = CampaignSummarySchema.extend({
  triggerConfig: z.record(z.unknown()),
  audience: z.record(z.unknown()),
  steps: z.array(CampaignStepResponseSchema),
});

export const CampaignStatsSchema = z.object({
  /** Headline numbers (current snapshot). */
  enrolledCount: z.number().int().min(0),
  activeCount: z.number().int().min(0),
  completedCount: z.number().int().min(0),
  exitedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  /** Channel-specific counts. */
  emailsSent: z.number().int().min(0),
  smsSent: z.number().int().min(0),
  /** Conversion: completed / enrolled. */
  conversionRate: z.number().min(0).max(1),
  /** Recent activity (last `days` days). */
  recentEnrollments: z.number().int().min(0),
  recentCompletions: z.number().int().min(0),
  recentFailures: z.number().int().min(0),
  /** Time-series for the chart (one bucket per day, last `days` days). */
  timeline: z.array(
    z.object({
      date: z.string(), // YYYY-MM-DD (UTC)
      enrolled: z.number().int().min(0),
      completed: z.number().int().min(0),
      failed: z.number().int().min(0),
    }),
  ),
});

export const EnrollmentListItemSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  leadId: z.string().nullable(),
  customerId: z.string().nullable(),
  status: CampaignEnrollmentStatusSchema,
  currentStepOrder: z.number().int().min(0),
  nextRunAt: z.string().nullable(),
  stepsExecuted: z.number().int().min(0),
  stepsFailed: z.number().int().min(0),
  emailsSent: z.number().int().min(0),
  smsSent: z.number().int().min(0),
  lastError: z.string().nullable(),
  enrolledAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  exitedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  // For display only — the lead / customer name.
  subjectName: z.string().nullable(),
  subjectEmail: z.string().nullable(),
  subjectPhone: z.string().nullable(),
});

/* ============================================================
 * Trigger event — the shape emitted to BullMQ when a domain event
 * happens (e.g. lead.created). The trigger service listens on
 * a BullMQ queue and matches against active campaigns.
 * ============================================================ */

export const CampaignTriggerEventSchema = z.object({
  /** Source event name. */
  event: z.enum([
    "lead.created",
    "lead.updated",
    "lead.status_changed",
    "lead.no_activity",
    "deal.stage_changed",
    "appointment.created",
    "appointment.completed",
    "lead.score_changed",
    "customer.birthday",
    "vehicle.matched",
  ]),
  dealerId: z.string().min(1).max(64),
  /** Primary subject — typically the lead id. */
  leadId: z.string().min(1).max(64).optional(),
  /** Secondary subject — the customer id (if any). */
  customerId: z.string().min(1).max(64).optional(),
  /** Event-specific payload (lead row, status transition, etc.). */
  payload: z.record(z.unknown()).default({}),
  /** ms epoch the event was emitted — used for no_activity drift. */
  occurredAt: z.number().int().optional(),
});

export type CampaignTriggerEvent = z.infer<typeof CampaignTriggerEventSchema>;

/* ============================================================
 * Trigger matcher config — derived from the Campaign row.
 * ============================================================ */

export const TRIGGER_TYPE_TO_EVENT: Readonly<
  Record<z.infer<typeof CampaignTriggerTypeSchema>, ReadonlyArray<string>>
> = {
  LEAD_CREATED: ["lead.created"],
  LEAD_UPDATED: ["lead.updated"],
  STATUS_CHANGE: ["lead.status_changed"],
  NO_ACTIVITY: ["lead.no_activity"],
  DEAL_STAGE: ["deal.stage_changed"],
  APPOINTMENT: ["appointment.created", "appointment.completed"],
  SCORE_CHANGE: ["lead.score_changed"],
  BIRTHDAY: ["customer.birthday"],
  VEHICLE_MATCH: ["vehicle.matched"],
  MANUAL: [], // never auto-enrolls
  API: [], // never auto-enrolls
};
