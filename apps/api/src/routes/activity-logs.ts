/**
 * Activity Log routes — /activity-logs/* and /entities/:type/:id/trail.
 *
 * All endpoints are tenant-scoped. The `dealerId` filter is taken
 * from the verified JWT (via `request.tenant`); an explicit
 * `where: { dealerId }` is applied to every Prisma query.
 *
 * Public route:
 *   GET  /health (handled by app.ts)
 *
 * Protected routes:
 *   GET    /activity-logs          — paginated timeline
 *   GET    /activity-logs/stats    — counts by action / user / day
 *   GET    /activity-logs/anomalies — flagged events
 *   GET    /activity-logs/:id      — full row with diff
 *   POST   /activity-logs/export   — CSV / JSON download
 *   GET    /entities/:type/:id/trail — entity-local timeline
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { prisma } from "../utils/prisma.js";
import {
  ActivityLogIdParamSchema,
  AnomaliesQuerySchema,
  ExportBodySchema,
  ListActivityLogsQuerySchema,
  StatsQuerySchema,
  TrailParamsSchema,
  TrailQuerySchema,
} from "../schemas/activity-log.schema.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../utils/validate.js";
import { AuthError, NotFoundError } from "../utils/errors.js";
import { anomalyDetector } from "../services/anomaly-detector.service.js";
import { activityPurgeJob } from "../queues/activity-purge.queue.js";

const DEFAULT_LIMIT = 50;

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: string;
}

function requireTenant(request: FastifyRequest): AccessPayload {
  if (!request.tenant) {
    throw new AuthError("Tenant context required");
  }
  return {
    userId: request.tenant.userId,
    dealerId: request.tenant.dealerId,
    role: request.tenant.role,
  };
}

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

function toIso(d: Date): string {
  return d.toISOString();
}

function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  // Cursor format: `<isoTimestamp>_<id>`. Stable, URL-safe.
  const idx = cursor.indexOf("_");
  if (idx <= 0) return undefined;
  const ts = cursor.slice(0, idx);
  const id = cursor.slice(idx + 1);
  const d = new Date(ts);
  if (Number.isNaN(d.getTime()) || id.length === 0) return undefined;
  return { createdAt: d, id };
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}_${row.id}`;
}

export async function activityLogRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /activity-logs
   * Paginated, filterable timeline. Cursor-paginated on
   * (createdAt desc, id desc).
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListActivityLogsQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const q = (request as { validatedQuery?: unknown }).validatedQuery as {
        userId?: string;
        action?: string;
        entityType?: string;
        entityId?: string;
        from?: string;
        to?: string;
        anomaly?: boolean;
        cursor?: string;
        limit?: number;
      };
      const limit = q.limit ?? DEFAULT_LIMIT;

      const where: Record<string, unknown> = { dealerId: ctx.dealerId };
      if (q.userId) where.userId = q.userId;
      if (q.action) where.action = q.action;
      if (q.entityType) where.entityType = q.entityType;
      if (q.entityId) where.entityId = q.entityId;
      if (q.from || q.to) {
        const createdAt: { gte?: Date; lte?: Date } = {};
        if (q.from) createdAt.gte = new Date(q.from);
        if (q.to) createdAt.lte = new Date(q.to);
        where.createdAt = createdAt;
      }
      if (q.anomaly === true) {
        where.metadata = { path: ["anomaly"], equals: true };
      }
      const cursor = decodeCursor(q.cursor);
      if (cursor) {
        // (createdAt, id) < (cursor.createdAt, cursor.id)
        where.OR = [
          { createdAt: { lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            id: { lt: cursor.id },
          },
        ];
      }

      const rows = await prisma.activityLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const last = data[data.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(last) : null;

      return reply.status(200).send({
        data: data.map(serialise),
        pagination: { hasMore, cursor: nextCursor },
      });
    },
  );

  /**
   * GET /activity-logs/stats
   * Counts grouped by action and by user, plus a daily time series.
   * Query: ?from=ISO&to=ISO
   */
  app.get(
    "/stats",
    {
      preHandler: [app.authenticate, validateQuery(StatsQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const q = (request as { validatedQuery?: unknown }).validatedQuery as {
        from?: string;
        to?: string;
      };
      const from = parseDate(q.from, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const to = parseDate(q.to, new Date());

      const [byAction, byUser, byDay, total, anomalyCount] = await Promise.all([
        prisma.activityLog.groupBy({
          by: ["action"],
          where: { dealerId: ctx.dealerId, createdAt: { gte: from, lte: to } },
          _count: { _all: true },
          orderBy: { _count: { action: "desc" } },
          take: 25,
        }),
        prisma.activityLog.groupBy({
          by: ["userId"],
          where: { dealerId: ctx.dealerId, createdAt: { gte: from, lte: to } },
          _count: { _all: true },
          orderBy: { _count: { userId: "desc" } },
          take: 25,
        }),
        dailyCounts(ctx.dealerId, from, to),
        prisma.activityLog.count({
          where: { dealerId: ctx.dealerId, createdAt: { gte: from, lte: to } },
        }),
        prisma.activityLog.count({
          where: {
            dealerId: ctx.dealerId,
            createdAt: { gte: from, lte: to },
            metadata: { path: ["anomaly"], equals: true },
          },
        }),
      ]);

      // Hydrate user names
      const userIds = byUser
        .map((g) => g.userId)
        .filter((v): v is string => typeof v === "string");
      const users = userIds.length
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true, role: true },
          })
        : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      return reply.status(200).send({
        data: {
          range: { from: toIso(from), to: toIso(to) },
          total,
          anomalyCount,
          byAction: byAction.map((g) => ({
            action: g.action,
            count: g._count._all,
          })),
          byUser: byUser.map((g) => {
            const u = g.userId ? userMap.get(g.userId) : null;
            return {
              userId: g.userId,
              name: u?.name ?? null,
              email: u?.email ?? null,
              role: u?.role ?? null,
              count: g._count._all,
            };
          }),
          byDay,
        },
      });
    },
  );

  /**
   * GET /activity-logs/anomalies
   * List anomaly-flagged rows, newest first.
   */
  app.get(
    "/anomalies",
    {
      preHandler: [app.authenticate, validateQuery(AnomaliesQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const q = (request as { validatedQuery?: unknown }).validatedQuery as {
        from?: string;
        to?: string;
        limit?: number;
      };
      const from = q.from ? new Date(q.from) : undefined;
      const to = q.to ? new Date(q.to) : undefined;
      const rows = await anomalyDetector.listAnomalies({
        dealerId: ctx.dealerId,
        from,
        to,
        limit: q.limit ?? 100,
      });
      return reply.status(200).send({ data: rows });
    },
  );

  /**
   * GET /activity-logs/:id
   * Full row with diff. 404 if the row is not in the dealer's tenant.
   */
  app.get(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        validateParams(ActivityLogIdParamSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as { id: string };
      const row = await prisma.activityLog.findFirst({
        where: { id, dealerId: ctx.dealerId },
      });
      if (!row) {
        throw new NotFoundError("Activity log not found");
      }
      return reply.status(200).send({ data: serialise(row) });
    },
  );

  /**
   * POST /activity-logs/export
   * Body: { from, to, format, userId?, action?, entityType?, anomalyOnly?, includeSnapshots? }
   * Returns a CSV or JSON download.
   */
  app.post(
    "/export",
    {
      preHandler: [app.authenticate, validateBody(ExportBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const body = request.body as {
        from: string;
        to: string;
        format: "csv" | "json";
        userId?: string;
        action?: string;
        entityType?: string;
        anomalyOnly: boolean;
        includeSnapshots: boolean;
      };

      const where: Record<string, unknown> = {
        dealerId: ctx.dealerId,
        createdAt: { gte: new Date(body.from), lte: new Date(body.to) },
      };
      if (body.userId) where.userId = body.userId;
      if (body.action) where.action = body.action;
      if (body.entityType) where.entityType = body.entityType;
      if (body.anomalyOnly) {
        where.metadata = { path: ["anomaly"], equals: true };
      }

      const rows = await prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 10_000, // safety cap; the anomaly detector flags >1000 anyway
      });

      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      if (body.format === "json") {
        const payload = rows.map((r) => {
          const base = serialise(r);
          if (!body.includeSnapshots) {
            base.before = undefined;
            base.after = undefined;
            base.diff = undefined;
          }
          return base;
        });
        return reply
          .status(200)
          .header("Content-Type", "application/json; charset=utf-8")
          .header(
            "Content-Disposition",
            `attachment; filename="activity-logs-${ts}.json"`,
          )
          .send(JSON.stringify({ data: payload }, null, 2));
      }

      // CSV
      const csv = renderCsv(rows, body.includeSnapshots);
      return reply
        .status(200)
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="activity-logs-${ts}.csv"`,
        )
        .send(csv);
    },
  );
}

/**
 * Entity-scoped trail — registered on a separate path so the route
 * file remains self-contained. Caller wires `/entities/:type/:id/trail`
 * at the app level.
 */
export async function entityTrailRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/:type/:id/trail",
    {
      preHandler: [
        app.authenticate,
        validateParams(TrailParamsSchema),
        validateQuery(TrailQuerySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { type, id } = request.params as { type: string; id: string };
      const q = (request as { validatedQuery?: unknown }).validatedQuery as {
        cursor?: string;
        limit?: number;
      };
      const limit = q.limit ?? DEFAULT_LIMIT;

      const where: Record<string, unknown> = {
        dealerId: ctx.dealerId,
        entityType: type,
        entityId: id,
      };
      const cursor = decodeCursor(q.cursor);
      if (cursor) {
        where.OR = [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ];
      }

      const rows = await prisma.activityLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const last = data[data.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(last) : null;

      return reply.status(200).send({
        data: data.map(serialise),
        pagination: { hasMore, cursor: nextCursor },
      });
    },
  );
}

/**
 * Manual purge trigger — protected, ADMIN only. Useful for ops when
 * the schedule hasn't run in a while.
 */
export async function activityLogAdminRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    "/purge",
    {
      preHandler: [app.authenticate, app.authorize(["ADMIN"])],
      config: { requireTenant: true },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await activityPurgeJob.run();
      return reply.status(200).send({ data: { deleted: result.deleted } });
    },
  );
}

/* ============================================================
 * Helpers
 * ============================================================ */

interface ActivityLogRow {
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
  metadata: unknown;
  createdAt: Date;
}

function serialise(row: ActivityLogRow): {
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
  createdAt: string;
} {
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
    createdAt: row.createdAt.toISOString(),
  };
}

function renderCsv(
  rows: ActivityLogRow[],
  includeSnapshots: boolean,
): string {
  const header = [
    "id",
    "createdAt",
    "userId",
    "action",
    "entityType",
    "entityId",
    "ipAddress",
    "userAgent",
    "anomaly",
    "anomalyReasons",
  ];
  if (includeSnapshots) {
    header.push("before", "after", "diff");
  }
  const lines: string[] = [header.join(",")];
  for (const r of rows) {
    const meta = (r.metadata as Record<string, unknown> | null) ?? {};
    const anomaly = meta.anomaly === true ? "true" : "false";
    const reasons = Array.isArray(meta.anomalyReasons)
      ? (meta.anomalyReasons as Array<{ reason: string }>)
          .map((x) => x.reason)
          .join("|")
      : "";
    const cols = [
      r.id,
      r.createdAt.toISOString(),
      r.userId ?? "",
      r.action,
      r.entityType,
      r.entityId ?? "",
      r.ipAddress ?? "",
      r.userAgent ?? "",
      anomaly,
      reasons,
    ];
    if (includeSnapshots) {
      cols.push(
        JSON.stringify(r.before ?? null),
        JSON.stringify(r.after ?? null),
        JSON.stringify(r.diff ?? null),
      );
    }
    lines.push(cols.map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

function escapeCsv(value: string): string {
  if (value === "") return "";
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function dailyCounts(
  dealerId: string,
  from: Date,
  to: Date,
): Promise<Array<{ day: string; count: number }>> {
  // We don't have a date_trunc helper via Prisma, so we fetch IDs
  // + createdAt and bucket in-process. The activity_log table is
  // already indexed on createdAt so this stays cheap.
  const rows = await prisma.activityLog.findMany({
    where: { dealerId, createdAt: { gte: from, lte: to } },
    select: { createdAt: true },
    take: 10_000,
  });
  const counts = new Map<string, number>();
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
}
