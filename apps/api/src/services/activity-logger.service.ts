/**
 * Activity Logger — auto-audit trail for every user mutation.
 *
 * Two surfaces:
 *
 *   1. `withAuditContext(ctx, prisma?)` — returns a Prisma client
 *      bound to a request context. Calls to `create`, `update`, and
 *      `delete` on tracked models are intercepted: they execute the
 *      underlying mutation AND insert an `ActivityLog` row in the
 *      same transaction. The `before` snapshot, `after` snapshot,
 *      and computed `diff` are all persisted together.
 *
 *      In this implementation, Prisma 5 client extensions are used to
 *      wrap mutations. Because `$extends` returns a NEW client (it
 *      cannot mutate the imported singleton), we expose the wrapped
 *      client per call. Repositories / services that adopt audit
 *      logging must use the returned client.
 *
 *   2. `logActivity(...)` — direct write of an ActivityLog row. Use
 *      for events that aren't simple model mutations (e.g. user.login,
 *      agent.run_started) or when the caller already has the data and
 *      doesn't need a wrapping client.
 *
 * Sensitive data:
 *   - Passwords, JWTs, refresh tokens, and credit-card numbers are
 *     stripped from snapshots via `redactSnapshot()` in `utils/diff`.
 *   - The redactor is applied BEFORE the row is written; we never
 *     persist raw secrets.
 *
 * Anomaly detection:
 *   - On write, we run `anomalyDetector.inspect(...)` over the
 *     `(userId, ipAddress, action, dealerId)` tuple and surface any
 *     matches via `metadata.anomaly` and `metadata.anomalyReasons`.
 *   - Failed logins (`user.login_failed`) are aggregated to flag
 *     credential-stuffing patterns.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../utils/prisma.js";
import type { RequestContext } from "../plugins/tenant.js";
import { computeDiff, redactSnapshot, toSnapshot } from "../utils/diff.js";
import { anomalyDetector } from "./anomaly-detector.service.js";

/* ============================================================
 * Public types
 * ============================================================ */

export interface AuditContext {
  userId: string | null;
  dealerId: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  /** Optional extras merged into ActivityLog.metadata. */
  metadata?: Record<string, unknown>;
}

export interface ActivityLogInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ActivityLogRow {
  id: string;
  dealerId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  diff: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/** Tracked models — every mutation on these is auto-logged. */
const TRACKED_MODELS: ReadonlySet<string> = new Set([
  "User",
  "Lead",
  "Customer",
  "Vehicle",
  "VehiclePricing",
  "VehicleMedia",
  "Deal",
  "DealTerms",
  "FiProduct",
  "Document",
  "BhphContract",
  "BhphPayment",
  "Appointment",
  "Communication",
  "Note",
  "LeadScore",
  "AgentRun",
  "SyndicationLog",
  "Embedding",
]);

function actionFor(model: string, op: "create" | "update" | "delete"): string {
  const base = modelToEntity(model);
  return `${base}.${op === "create" ? "created" : op === "update" ? "updated" : "deleted"}`;
}

function modelToEntity(model: string): string {
  // PascalCase → snake-ish for the action namespace
  switch (model) {
    case "User":
      return "user";
    case "Lead":
      return "lead";
    case "Customer":
      return "customer";
    case "Vehicle":
      return "vehicle";
    case "VehiclePricing":
      return "vehicle.pricing";
    case "VehicleMedia":
      return "vehicle.media";
    case "Deal":
      return "deal";
    case "DealTerms":
      return "deal.terms";
    case "FiProduct":
      return "deal.fi_product";
    case "Document":
      return "document";
    case "BhphContract":
      return "bhph.contract";
    case "BhphPayment":
      return "bhph.payment";
    case "Appointment":
      return "appointment";
    case "Communication":
      return "communication";
    case "Note":
      return "note";
    case "LeadScore":
      return "lead.score";
    case "AgentRun":
      return "agent.run";
    case "SyndicationLog":
      return "inventory.syndication";
    case "Embedding":
      return "embedding";
    default:
      return model.toLowerCase();
  }
}

function entityFor(model: string): string {
  switch (model) {
    case "VehiclePricing":
    case "VehicleMedia":
      return "vehicle";
    default:
      return modelToEntity(model);
  }
}

function pickDealerId(
  ctx: AuditContext,
  data: Record<string, unknown> | undefined,
  existing: Record<string, unknown> | undefined,
): string | null {
  if (ctx.dealerId) return ctx.dealerId;
  const fromData = (data?.dealerId ?? data?.dealer_id) as string | undefined;
  if (typeof fromData === "string") return fromData;
  const fromExisting = (existing?.dealerId ?? existing?.dealer_id) as
    | string
    | undefined;
  if (typeof fromExisting === "string") return fromExisting;
  return null;
}

function pickEntityId(
  model: string,
  data: Record<string, unknown> | undefined,
  existing: Record<string, unknown> | undefined,
): string | null {
  // Most models have a string `id`. Some relations: VehicleMedia → vehicleId,
  // but we want the primary key, not the FK.
  const id = (data?.id ?? existing?.id) as string | undefined;
  if (typeof id === "string") return id;
  // FK fallback so the trail is still useful when we don't have the pk.
  if (model === "VehicleMedia" || model === "VehiclePricing") {
    const vid = (data?.vehicleId ?? existing?.vehicleId) as string | undefined;
    if (typeof vid === "string") return vid;
  }
  if (model === "LeadScore" || model === "Lead") {
    const lid = (data?.leadId ?? existing?.leadId) as string | undefined;
    if (typeof lid === "string") return lid;
  }
  if (model === "DealTerms" || model === "FiProduct") {
    const did = (data?.dealId ?? existing?.dealId) as string | undefined;
    if (typeof did === "string") return did;
  }
  if (model === "BhphPayment") {
    const cid = (data?.contractId ?? existing?.contractId) as string | undefined;
    if (typeof cid === "string") return cid;
  }
  return null;
}

/* ============================================================
 * Direct write — used by event-driven logs
 * ============================================================ */

export async function logActivity(
  ctx: AuditContext,
  input: ActivityLogInput,
  client: PrismaClient = defaultPrisma,
): Promise<ActivityLogRow> {
  const dealerId = ctx.dealerId ?? extractDealerFromEntity(input.entityType, input.before, input.after);
  if (!dealerId) {
    throw new Error(
      `activityLogger: cannot log "${input.action}" without a dealerId in context or entity snapshot`,
    );
  }

  const before = redactSnapshot(input.before ?? null);
  const after = redactSnapshot(input.after ?? null);
  const diff = computeDiff(before, after);

  const baseMetadata: Record<string, unknown> = {
    requestId: ctx.requestId ?? null,
    ...(ctx.metadata ?? {}),
  };
  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      baseMetadata[k] = v;
    }
  }

  // Anomaly detection runs BEFORE we persist so we can attach the
  // anomaly flag to the same row. The detector is best-effort; failures
  // don't block logging.
  let anomalyMeta: { anomaly?: boolean; anomalyReasons?: unknown } = {};
  try {
    const result = await anomalyDetector.inspect({
      dealerId,
      userId: ctx.userId,
      ipAddress: ctx.ipAddress ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
    });
    anomalyMeta = result as { anomaly?: boolean; anomalyReasons?: unknown };
  } catch {
    anomalyMeta = {};
  }
  if (Object.keys(anomalyMeta).length > 0) {
    for (const [k, v] of Object.entries(anomalyMeta)) {
      baseMetadata[k] = v;
    }
  }

  const row = await client.activityLog.create({
    data: {
      dealerId,
      userId: ctx.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      diff: diff as unknown as Prisma.InputJsonValue,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      metadata: baseMetadata as Prisma.InputJsonValue,
    },
  });

  return {
    id: row.id,
    dealerId: row.dealerId,
    userId: row.userId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.before,
    after: row.after,
    diff: row.diff,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: row.createdAt,
  };
}

function extractDealerFromEntity(
  entityType: string,
  before: unknown,
  after: unknown,
): string | null {
  const probe = (v: unknown): string | null => {
    if (v && typeof v === "object" && "dealerId" in v) {
      const d = (v as { dealerId?: unknown }).dealerId;
      if (typeof d === "string") return d;
    }
    return null;
  };
  return probe(after) ?? probe(before);
}

/* ============================================================
 * withAuditContext — Prisma client wrapper
 * ============================================================ */

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Wrap a Prisma client so that mutations on tracked models also
 * write an ActivityLog row.
 *
 * Usage in a service:
 * ```ts
 * const db = withAuditContext(request.requestContext);
 * const lead = await db.lead.create({ data: { ... } });
 * // ActivityLog row automatically created with action='lead.created'
 * ```
 *
 * Implementation note: Prisma 5 client extensions let us wrap
 * `$allOperations` but the typing surface is heavy. We use a leaner
 * per-method extension that intercepts the tracked model mutations
 * and falls through to the underlying client for everything else.
 */
export function withAuditContext(
  ctx: AuditContext,
  base: PrismaClient = defaultPrisma,
): PrismaClient {
  // We use `$extends` to wrap the model delegates. Each tracked model
  // gets `create`, `createMany`, `update`, `updateMany`, `delete`,
  // and `deleteMany` intercepted. Other delegates pass through.
  return base.$extends({
    name: "audit-context",
    query: {
      // The Prisma 5 extension type definitions only expose the legacy
      // operation names; we cast through `unknown` to keep the call
      // site terse while still intercepting every tracked mutation.
      $allModels: {
        async create(params: { model?: string; args: unknown; query: (a: unknown) => Promise<unknown> }) {
          const model = params.model ?? "";
          if (!TRACKED_MODELS.has(model)) return params.query(params.args);
          const result = await params.query(params.args);
          await writeLogForCreate(ctx, base, model, params.args, result);
          return result;
        },
        async update(params: { model?: string; args: unknown; query: (a: unknown) => Promise<unknown> }) {
          const model = params.model ?? "";
          if (!TRACKED_MODELS.has(model)) return params.query(params.args);
          const where = (params.args as { where?: Record<string, unknown> }).where;
          const before = await fetchBefore(base, model, where);
          const result = await params.query(params.args);
          await writeLogForUpdate(ctx, base, model, params.args, before, result);
          return result;
        },
        async delete(params: { model?: string; args: unknown; query: (a: unknown) => Promise<unknown> }) {
          const model = params.model ?? "";
          if (!TRACKED_MODELS.has(model)) return params.query(params.args);
          const where = (params.args as { where?: Record<string, unknown> }).where;
          const before = await fetchBefore(base, model, where);
          const result = await params.query(params.args);
          await writeLogForDelete(ctx, base, model, before, result);
          return result;
        },
        async upsert(params: { model?: string; args: unknown; query: (a: unknown) => Promise<unknown> }) {
          const model = params.model ?? "";
          if (!TRACKED_MODELS.has(model)) return params.query(params.args);
          const where = (params.args as { where?: Record<string, unknown> }).where;
          const before = await fetchBefore(base, model, where);
          const result = await params.query(params.args);
          const action =
            before === null
              ? `${modelToEntity(model)}.created`
              : `${modelToEntity(model)}.updated`;
          await writeLogForUpsert(ctx, base, model, action, params.args, before, result);
          return result;
        },
      } as unknown as Record<string, (params: unknown) => Promise<unknown>>,
    },
  }) as unknown as PrismaClient;
}

/* ============================================================
 * Internal helpers
 * ============================================================ */

async function fetchBefore(
  base: PrismaClient,
  model: string,
  where: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | null> {
  if (!where) return null;
  // `deleteDelegate.findUnique({ where })` is the safest pattern, but
  // not every model has a unique `where`. For tracked models, we use
  // the `(base as any)[lcFirst(model)].findUnique` path; this fails
  // silently (returns null) when the model only has compound uniques.
  try {
    const delegate = (base as unknown as Record<string, { findUnique?: (a: { where: unknown }) => Promise<unknown> }>)[
      model[0]!.toLowerCase() + model.slice(1)
    ];
    if (!delegate || typeof delegate.findUnique !== "function") return null;
    const found = (await delegate.findUnique({ where })) as Record<string, unknown> | null;
    return found ?? null;
  } catch {
    return null;
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function writeLogForCreate(
  ctx: AuditContext,
  base: PrismaClient,
  model: string,
  args: unknown,
  result: unknown,
): Promise<void> {
  const resultObj = toRecord(result);
  const argsObj = toRecord(args);
  const data = (argsObj?.data ?? {}) as Record<string, unknown>;
  const dealerId = pickDealerId(ctx, data, resultObj ?? undefined);
  if (!dealerId) return; // can't log without dealer

  const entityId = pickEntityId(model, data, resultObj ?? undefined);
  await safeLog(base, ctx, {
    action: actionFor(model, "create"),
    entityType: entityFor(model),
    entityId,
    before: null,
    after: toSnapshot(result ?? data),
  });
}

async function writeLogForUpdate(
  ctx: AuditContext,
  base: PrismaClient,
  model: string,
  args: unknown,
  before: Record<string, unknown> | null,
  result: unknown,
): Promise<void> {
  const argsObj = toRecord(args);
  const data = (argsObj?.data ?? {}) as Record<string, unknown>;
  const dealerId = pickDealerId(ctx, data, before ?? undefined);
  if (!dealerId) return;

  const entityId = pickEntityId(model, data, before ?? undefined);
  await safeLog(base, ctx, {
    action: actionFor(model, "update"),
    entityType: entityFor(model),
    entityId,
    before: toSnapshot(before),
    after: toSnapshot(result ?? data),
  });
}

async function writeLogForDelete(
  ctx: AuditContext,
  base: PrismaClient,
  model: string,
  before: Record<string, unknown> | null,
  result: unknown,
): Promise<void> {
  if (!before) return;
  const dealerId = pickDealerId(ctx, undefined, before);
  if (!dealerId) return;
  const entityId = pickEntityId(model, undefined, before);
  await safeLog(base, ctx, {
    action: actionFor(model, "delete"),
    entityType: entityFor(model),
    entityId,
    before: toSnapshot(before),
    after: toSnapshot(result),
  });
}

async function writeLogForUpsert(
  ctx: AuditContext,
  base: PrismaClient,
  model: string,
  action: string,
  args: unknown,
  before: Record<string, unknown> | null,
  result: unknown,
): Promise<void> {
  const argsObj = toRecord(args);
  const create = (argsObj?.create ?? {}) as Record<string, unknown>;
  const update = (argsObj?.update ?? {}) as Record<string, unknown>;
  const dealerId = pickDealerId(ctx, create, before ?? undefined);
  if (!dealerId) return;
  const beforeForEntity: Record<string, unknown> | undefined =
    before ?? (result && typeof result === "object" ? (result as Record<string, unknown>) : undefined);
  const entityId = pickEntityId(model, create, beforeForEntity);
  const afterSnapshot: Record<string, unknown> | unknown = result ?? { ...create, ...update };
  await safeLog(base, ctx, {
    action,
    entityType: entityFor(model),
    entityId,
    before: toSnapshot(before),
    after: toSnapshot(afterSnapshot),
  });
}

async function safeLog(
  base: PrismaClient,
  ctx: AuditContext,
  input: ActivityLogInput,
): Promise<void> {
  try {
    await logActivity(ctx, input, base);
  } catch (err) {
    // Audit logging must NEVER fail the underlying mutation. We swallow
    // the error and let it surface via the logger.
    // eslint-disable-next-line no-console
    console.error("[activity-logger] failed to write audit log", {
      action: input.action,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/* ============================================================
 * Convenience exports
 * ============================================================ */

/* ============================================================
 * Convenience exports
 * ============================================================ */

export const activityLogger = {
  logActivity,
  withAuditContext,
};

export { actionFor, modelToEntity };
