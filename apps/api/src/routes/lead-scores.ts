/**
 * Lead Score routes — /leads/:id/score, /leads/score, /leads/stats/*
 *
 * All routes are tenant-scoped (auth + tenant decorators). The
 * multi-tenant safety net is the explicit `dealerId` filter on every
 * Prisma call.
 *
 * Endpoints:
 *   POST  /leads/:id/score              — recompute & persist, return result
 *   GET   /leads/:id/score/history      — last 100 history rows
 *   GET   /leads?minScore=...&...       — list with score filters (alias)
 *   POST  /leads/batch-score           — admin/manager-only, recompute many
 *   GET   /leads/stats/distribution     — count by classification
 *
 * The /leads list endpoint itself lives elsewhere (or in this file's
 * bottom block as a convenience for the UI's score column). We keep
 * that surface lean and only attach the score filter — the full
 * pagination/filter UI lives in leads.list.ts routes.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../utils/prisma.js";
import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { leadScoreTriggers } from "../services/lead-score-triggers.service.js";
import { leadScoreQueue } from "../queues/lead-score.queue.js";
import { NotFoundError } from "../utils/errors.js";
import {
  BatchScoreBodySchema,
  ClassificationSchema,
  DistributionQuerySchema,
  LeadIdParamsSchema,
  ListLeadsQuerySchema,
  RecomputeBodySchema,
  ScoreHistoryQuerySchema,
} from "../schemas/lead-score.schema.js";
import type { Classification } from "../services/lead-scorer.service.js";

/* ============================================================
 * Helpers
 * ============================================================ */

const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 200;

function toIso(d: Date): string {
  return d.toISOString();
}

interface LeadScopedRequest {
  user: { userId: string; dealerId: string; role: string };
  tenant: { dealerId: string; userId: string; role: string };
}

/* ============================================================
 * Routes
 * ============================================================ */

export async function leadScoreRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /leads/:id/score
   * Recompute the score for a single lead, persist a history row, and
   * return the full breakdown (signals + top signals).
   */
  app.post(
    "/:id/score",
    {
      preHandler: [
        app.authenticate,
        validateParams(LeadIdParamsSchema),
        validateBody(RecomputeBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: leadId } = request.params as { id: string };
      const body = (request.body ?? { trigger: "manual" }) as {
        trigger: Parameters<typeof leadScoreTriggers.recomputeAndPersist>[2];
      };
      const { dealerId } = (request as unknown as LeadScopedRequest).tenant;

      const out = await leadScoreTriggers.recomputeAndPersist(
        dealerId,
        leadId,
        body.trigger ?? "manual",
      );
      if (!out) throw new NotFoundError("Lead not found");

      return reply.status(200).send({ data: out.result });
    },
  );

  /**
   * GET /leads/:id/score/history
   * Last N score history rows (newest first).
   */
  app.get(
    "/:id/score/history",
    {
      preHandler: [
        app.authenticate,
        validateParams(LeadIdParamsSchema),
        validateQuery(ScoreHistoryQuerySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: leadId } = request.params as { id: string };
      const q = (request as { validatedQuery?: { limit?: number; cursor?: string } })
        .validatedQuery ?? { limit: DEFAULT_HISTORY_LIMIT };
      const limit = Math.min(q.limit ?? DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT);
      const { dealerId } = (request as unknown as LeadScopedRequest).tenant;

      // Verify the lead belongs to this dealer (404 on miss — never leak
      // the existence of cross-tenant rows).
      const lead = await prisma.lead.findFirst({
        where: { dealerId, id: leadId },
        select: { id: true },
      });
      if (!lead) throw new NotFoundError("Lead not found");

      const rows = await prisma.leadScore.findMany({
        where: { dealerId, leadId },
        orderBy: { scoredAt: "desc" },
        take: limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > limit;
      const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
        id: r.id,
        score: r.score,
        classification: r.classification as Classification,
        signals: r.signals,
        modelVersion: r.modelVersion,
        scoredAt: toIso(r.scoredAt),
      }));
      const nextCursor = hasMore
        ? (items[items.length - 1]?.id ?? null)
        : null;

      return reply.status(200).send({
        data: items,
        pagination: { hasMore, cursor: nextCursor },
      });
    },
  );

  /**
   * POST /leads/batch-score
   * Admin / manager only. Enqueue a batch score recompute.
   * Returns immediately with a job summary; the actual work happens
   * in the BullMQ worker.
   */
  app.post(
    "/batch-score",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateBody(BatchScoreBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        limit: number;
        olderThanHours: number;
        dealerId?: string;
      };
      const { dealerId: callerDealerId } = (request as unknown as LeadScopedRequest).tenant;
      const dealerId = body.dealerId ?? callerDealerId;

      const cutoff = new Date(Date.now() - body.olderThanHours * 60 * 60 * 1000);
      const candidates = await prisma.lead.findMany({
        where: {
          dealerId,
          OR: [{ lastScoredAt: null }, { lastScoredAt: { lt: cutoff } }],
        },
        select: { id: true },
        take: body.limit,
        orderBy: { lastScoredAt: "asc" },
      });

      let enqueued = 0;
      let direct = 0;
      for (const lead of candidates) {
        const r = await leadScoreQueue.enqueueScoreRecompute(
          {
            dealerId,
            leadId: lead.id,
            trigger: "drift_sweep",
          },
          { jobId: `score:${dealerId}:${lead.id}:drift:${Date.now()}` },
        );
        if (r.queued) enqueued += 1;
        else direct += 1;
      }

      return reply.status(202).send({
        data: {
          total: candidates.length,
          enqueued,
          direct,
        },
      });
    },
  );

  /**
   * GET /leads/stats/distribution
   * Count of cold / warm / hot leads for the tenant.
   */
  app.get(
    "/stats/distribution",
    {
      preHandler: [app.authenticate, validateQuery(DistributionQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dealerId } = (request as unknown as LeadScopedRequest).tenant;

      // Group by classification. Prisma's groupBy on a non-indexed free-text
      // column works fine at the SQL level.
      const grouped = await prisma.lead.groupBy({
        by: ["classification"],
        where: { dealerId },
        _count: { _all: true },
      });

      const counts: Record<Classification, number> = {
        cold: 0,
        warm: 0,
        hot: 0,
      };
      for (const g of grouped) {
        const cls = g.classification as Classification;
        if (cls === "cold" || cls === "warm" || cls === "hot") {
          counts[cls] = g._count._all;
        }
      }

      const total = (counts.cold ?? 0) + (counts.warm ?? 0) + (counts.hot ?? 0);
      const buckets = (["cold", "warm", "hot"] as const).map((cls) => ({
        classification: cls,
        count: counts[cls] ?? 0,
        pct: total > 0 ? Math.round(((counts[cls] ?? 0) / total) * 1000) / 10 : 0,
      }));

      return reply.status(200).send({
        data: {
          total,
          buckets,
        },
      });
    },
  );

  /**
   * GET /leads/score/list
   * Score-filtered lead list. Supports minScore / maxScore / classification.
   * Used by the UI for the Hot Leads panel and the "Hot / Warm / Cold"
   * filter dropdown on /leads.
   */
  app.get(
    "/score/list",
    {
      preHandler: [app.authenticate, validateQuery(ListLeadsQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = (request as unknown as { validatedQuery: import("zod").infer<typeof ListLeadsQuerySchema> })
        .validatedQuery;
      const { dealerId } = (request as unknown as LeadScopedRequest).tenant;

      const where: Prisma.LeadWhereInput = { dealerId };
      if (q.source && q.source !== "all") where.source = q.source;
      if (q.status && q.status !== "all") where.status = q.status as Prisma.EnumLeadStatusFilter["equals"];
      if (q.assignedTo && q.assignedTo !== "all") {
        where.assignedToId = q.assignedTo;
      }
      if (q.search && q.search.trim().length > 0) {
        const s = q.search.trim();
        where.OR = [
          { firstName: { contains: s, mode: "insensitive" } },
          { lastName: { contains: s, mode: "insensitive" } },
          { email: { contains: s, mode: "insensitive" } },
          { phone: { contains: s, mode: "insensitive" } },
        ];
      }
      if (q.minScore !== undefined || q.maxScore !== undefined) {
        where.currentScore = {
          ...(q.minScore !== undefined ? { gte: q.minScore } : {}),
          ...(q.maxScore !== undefined ? { lte: q.maxScore } : {}),
        };
      }
      if (q.classification) {
        where.classification = q.classification;
      }

      const limit = Math.min(q.limit ?? 50, 200);
      const rows = await prisma.lead.findMany({
        where,
        orderBy: [{ currentScore: "desc" }, { createdAt: "desc" }],
        take: limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: {
          assignedTo: { select: { id: true, name: true } },
        },
      });

      const hasMore = rows.length > limit;
      const trimmed = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null;

      return reply.status(200).send({
        data: trimmed.map((l) => ({
          id: l.id,
          firstName: l.firstName,
          lastName: l.lastName,
          email: l.email,
          phone: l.phone,
          source: l.source,
          status: l.status,
          currentScore: l.currentScore,
          classification: ClassificationSchema.parse(l.classification),
          lastScoredAt: l.lastScoredAt ? toIso(l.lastScoredAt) : null,
          assignedTo: l.assignedTo
            ? { id: l.assignedTo.id, name: l.assignedTo.name }
            : null,
          createdAt: toIso(l.createdAt),
          updatedAt: toIso(l.updatedAt),
        })),
        pagination: { hasMore, cursor: nextCursor },
      });
    },
  );
}
