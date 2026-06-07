/**
 * Lead Routing settings routes — /routing/*
 *
 * GET    /routing/config       — current routing config + rep availability
 * PATCH  /routing/config       — update routing strategy / source map / availability
 * GET    /routing/log          — recent routing decisions (last 100)
 * GET    /routing/reps         — active sales reps with availability
 * POST   /routing/preview      — "when a lead from {source} arrives, who gets it?"
 *
 * All routes require an authenticated user with a tenant context.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Dealer, Prisma } from "@prisma/client";

import { prisma } from "../utils/prisma.js";
import { validateBody, validateQuery } from "../utils/validate.js";
import { UpdateRoutingSettingsSchema } from "../schemas/lead-router.schema.js";
import {
  DealerRoutingSettingsSchema,
  type DealerRoutingSettings,
} from "../schemas/lead-router.schema.js";
import { leadRouter, listRoutingLog } from "../services/lead-router.service.js";
import { NotFoundError } from "../utils/errors.js";


const LogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const PreviewBodySchema = z.object({
  source: z.string().min(1).max(80),
  vehicleInterest: z.union([z.string(), z.array(z.record(z.unknown())), z.null()]).optional(),
  score: z.number().int().min(0).max(100).default(50),
  vehicleOwnerId: z.string().nullable().optional(),
});

function parseSettings(raw: unknown): DealerRoutingSettings {
  const parsed = DealerRoutingSettingsSchema.safeParse(raw ?? {});
  return parsed.success
    ? parsed.data
    : {
        strategy: "LOAD_BALANCED",
        priority: ["VEHICLE_MATCH", "SOURCE_BASED", "LOAD_BALANCED"],
        source_routing: {},
        rep_availability: {},
      };
}

export async function routingSettingsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /routing/config
   */
  app.get(
    "/config",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dealer = await prisma.dealer.findUnique({
        where: { id: request.tenant.dealerId },
      });
      if (!dealer) throw new NotFoundError("Dealer not found");
      const settings = parseSettings(dealer.settings);
      return reply.status(200).send({ data: settings });
    },
  );

  /**
   * PATCH /routing/config
   */
  app.patch(
    "/config",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateBody(UpdateRoutingSettingsSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as z.infer<typeof UpdateRoutingSettingsSchema>;
      const existing = await prisma.dealer.findUnique({
        where: { id: request.tenant.dealerId },
      });
      if (!existing) throw new NotFoundError("Dealer not found");
      const current = parseSettings(existing.settings);
      const next: DealerRoutingSettings = {
        ...current,
        ...(body.strategy !== undefined ? { strategy: body.strategy } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.source_routing !== undefined
          ? { source_routing: body.source_routing }
          : {}),
        ...(body.rep_availability !== undefined
          ? { rep_availability: body.rep_availability }
          : {}),
      };
      await prisma.dealer.update({
        where: { id: request.tenant.dealerId },
        data: { settings: next as unknown as Prisma.InputJsonValue },
      });
      return reply.status(200).send({ data: next });
    },
  );

  /**
   * GET /routing/reps — active sales reps with availability.
   */
  app.get(
    "/reps",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dealer = await prisma.dealer.findUnique({
        where: { id: request.tenant.dealerId },
      });
      if (!dealer) throw new NotFoundError("Dealer not found");
      const settings = parseSettings(dealer.settings);
      const reps = await leadRouter.loadCandidates(request.tenant.dealerId, settings);
      return reply.status(200).send({ data: reps });
    },
  );

  /**
   * GET /routing/log
   */
  app.get(
    "/log",
    {
      preHandler: [app.authenticate, validateQuery(LogQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = (request as { validatedQuery?: z.infer<typeof LogQuerySchema> })
        .validatedQuery ?? { limit: 100 };
      const rows = await listRoutingLog({
        dealerId: request.tenant.dealerId,
        limit: q.limit,
      });
      return reply.status(200).send({
        data: rows.map((r) => ({
          ...r,
          routedAt: r.routedAt.toISOString(),
        })),
      });
    },
  );

  /**
   * POST /routing/preview
   * "When a lead from {source} arrives, who gets it?"
   * Runs the router with a fake lead; does NOT persist.
   */
  app.post(
    "/preview",
    {
      preHandler: [app.authenticate, validateBody(PreviewBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as z.infer<typeof PreviewBodySchema>;
      const dealer: Dealer | null = await prisma.dealer.findUnique({
        where: { id: request.tenant.dealerId },
      });
      if (!dealer) throw new NotFoundError("Dealer not found");
      const fakeLead = {
        id: "preview",
        dealerId: dealer.id,
        source: body.source,
        status: "NEW" as const,
        score: body.score,
        currentScore: body.score,
        classification: "cold",
        lastScoredAt: null,
        lastContactedAt: null,
        unsubscribed: false,
        bounced: false,
        assignedToId: null,
        customerId: null,
        firstName: "Preview",
        lastName: "Lead",
        email: null,
        phone: null,
        vehicleInterest: body.vehicleInterest
          ? typeof body.vehicleInterest === "string"
            ? ([{ title: body.vehicleInterest }] as unknown as Prisma.JsonArray)
            : (body.vehicleInterest as unknown as Prisma.JsonArray)
          : ([] as unknown as Prisma.JsonArray),
        sourceMeta: { campaign_id: body.source } as unknown as Prisma.JsonObject,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const decision = await leadRouter.routeLead({
        lead: fakeLead,
        dealer,
        vehicleOwnerId: body.vehicleOwnerId ?? null,
      });
      // Hydrate rep names
      const repIds = [
        decision.assignedTo,
        ...decision.alternativeReps,
      ].filter((v): v is string => Boolean(v));
      const reps = repIds.length
        ? await prisma.user.findMany({
            where: { id: { in: repIds } },
            select: { id: true, name: true },
          })
        : [];
      const nameById = new Map(reps.map((r) => [r.id, r.name]));
      return reply.status(200).send({
        data: {
          ...decision,
          assignedToName: decision.assignedTo
            ? nameById.get(decision.assignedTo) ?? null
            : null,
          alternativeReps: decision.alternativeReps.map((id) => ({
            id,
            name: nameById.get(id) ?? null,
          })),
        },
      });
    },
  );
}
