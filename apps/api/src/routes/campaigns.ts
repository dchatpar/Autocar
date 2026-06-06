/**
 * Campaign routes — /api/campaigns/*
 *
 * Mounted under `/campaigns` (the parent app.ts owns the prefix).
 *
 * All routes require authentication. RBAC:
 *   - GET  /campaigns                 — any authenticated user
 *   - GET  /campaigns/:id             — any authenticated user
 *   - GET  /campaigns/:id/stats       — any authenticated user
 *   - GET  /campaigns/:id/enrollments — any authenticated user
 *   - POST /campaigns                 — admin/manager
 *   - PUT  /campaigns/:id             — admin/manager
 *   - POST /campaigns/:id/activate    — admin/manager
 *   - POST /campaigns/:id/pause       — admin/manager
 *   - POST /campaigns/:id/archive     — admin/manager
 *   - POST /campaigns/:id/enroll      — admin/manager
 *   - POST /campaigns/enrollments/:id/unenroll — admin/manager
 *
 * Multi-tenant: every Prisma call is scoped by `dealerId` from the
 * JWT payload. The campaign service is the only data-access path; the
 * route layer never queries Prisma directly.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CampaignIdParamsSchema,
  CreateCampaignBodySchema,
  EnrollmentIdParamsSchema,
  EnrollLeadsBodySchema,
  ListCampaignsQuerySchema,
  ListEnrollmentsQuerySchema,
  UnenrollBodySchema,
  UpdateCampaignBodySchema,
  CampaignStatsQuerySchema,
} from "../schemas/campaign.schema.js";
import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { campaignService } from "../services/campaign.service.js";
import type { UserRole } from "@prisma/client";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /campaigns
   * List campaigns for the current dealer.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListCampaignsQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const q = (
        request as unknown as { validatedQuery: import("zod").infer<typeof ListCampaignsQuerySchema> }
      ).validatedQuery;
      const result = await campaignService.list(payload.dealerId, q);
      return reply.status(200).send({
        data: result.items,
        pagination: result.pagination,
      });
    },
  );

  /**
   * POST /campaigns
   * Create a new campaign (DRAFT). Admin/manager only.
   */
  app.post(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateBody(CreateCampaignBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as import("zod").infer<typeof CreateCampaignBodySchema>;
      const created = await campaignService.create(
        payload.dealerId,
        payload.userId,
        body,
      );
      // Re-fetch via getById to get the full detail shape.
      const detail = await campaignService.getById(payload.dealerId, created.id);
      return reply.status(201).send({ data: detail });
    },
  );

  /**
   * GET /campaigns/:id
   * Campaign detail (with steps).
   */
  app.get(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        validateParams(CampaignIdParamsSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = request.params as { id: string };
      const detail = await campaignService.getById(payload.dealerId, id);
      return reply.status(200).send({ data: detail });
    },
  );

  /**
   * PUT /campaigns/:id
   * Update a campaign. Admin/manager only.
   */
  app.put(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateParams(CampaignIdParamsSchema),
        validateBody(UpdateCampaignBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = request.params as { id: string };
      const body = request.body as import("zod").infer<typeof UpdateCampaignBodySchema>;
      const detail = await campaignService.update(payload.dealerId, id, body);
      return reply.status(200).send({ data: detail });
    },
  );

  /**
   * POST /campaigns/:id/activate
   * Activate a draft or paused campaign.
   */
  app.post(
    "/:id/activate",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateParams(CampaignIdParamsSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = request.params as { id: string };
      const out = await campaignService.activate(payload.dealerId, id);
      return reply.status(200).send({ data: out });
    },
  );

  /**
   * POST /campaigns/:id/pause
   * Pause an active campaign.
   */
  app.post(
    "/:id/pause",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateParams(CampaignIdParamsSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = request.params as { id: string };
      const out = await campaignService.pause(payload.dealerId, id);
      return reply.status(200).send({ data: out });
    },
  );

  /**
   * POST /campaigns/:id/archive
   * Archive a campaign.
   */
  app.post(
    "/:id/archive",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateParams(CampaignIdParamsSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = request.params as { id: string };
      const out = await campaignService.archive(payload.dealerId, id);
      return reply.status(200).send({ data: out });
    },
  );

  /**
   * POST /campaigns/:id/enroll
   * Manually enroll leads / customers (or a backfill using the
   * campaign's `audience` filter).
   */
  app.post(
    "/:id/enroll",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateParams(CampaignIdParamsSchema),
        validateBody(EnrollLeadsBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = request.params as { id: string };
      const body = request.body as import("zod").infer<typeof EnrollLeadsBodySchema>;
      const result = await campaignService.enroll(
        payload.dealerId,
        payload.userId,
        id,
        body,
      );
      return reply.status(202).send({ data: result });
    },
  );

  /**
   * GET /campaigns/:id/enrollments
   * Paginated enrollment list for a campaign.
   */
  app.get(
    "/:id/enrollments",
    {
      preHandler: [
        app.authenticate,
        validateParams(CampaignIdParamsSchema),
        validateQuery(ListEnrollmentsQuerySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = request.params as { id: string };
      const q = (
        request as unknown as { validatedQuery: import("zod").infer<typeof ListEnrollmentsQuerySchema> }
      ).validatedQuery;
      const result = await campaignService.listEnrollments(
        payload.dealerId,
        id,
        q,
      );
      return reply.status(200).send({
        data: result.items,
        pagination: result.pagination,
      });
    },
  );

  /**
   * GET /campaigns/:id/stats
   * Headline stats + 30-day timeline.
   */
  app.get(
    "/:id/stats",
    {
      preHandler: [
        app.authenticate,
        validateParams(CampaignIdParamsSchema),
        validateQuery(CampaignStatsQuerySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = request.params as { id: string };
      const q = (
        request as unknown as { validatedQuery: import("zod").infer<typeof CampaignStatsQuerySchema> }
      ).validatedQuery;
      const stats = await campaignService.stats(payload.dealerId, id, q.days);
      return reply.status(200).send({ data: stats });
    },
  );

  /**
   * POST /campaigns/enrollments/:id/unenroll
   * Stop an active enrollment.
   *
   * Note: the path uses `enrollments/:id` (not `/:id/enrollments/:id`)
   * so it sits outside the `/campaigns/:id` prefix space. The route
   * is declared here for locality.
   */
  app.post(
    "/enrollments/:id/unenroll",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateParams(EnrollmentIdParamsSchema),
        validateBody(UnenrollBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = request.params as { id: string };
      const body = request.body as
        | { reason?: string }
        | undefined;
      const out = await campaignService.unenroll(
        payload.dealerId,
        id,
        body?.reason ?? null,
      );
      return reply.status(200).send({ data: out });
    },
  );
}
