/**
 * AI Agent routes — /api/ai-agents/*
 *
 * Mounted under `/ai-agents` (parent app.ts owns the prefix).
 *
 * All routes require authentication.
 *
 * Agents:
 *   NOVA  — Lead routing + first-touch messaging
 *   ARIO  — Inventory insights
 *   SAGE  — Deal analytics
 *   LUCAS  — Customer lifetime value
 *
 * Multi-tenant: every Prisma call is scoped by `dealerId` from the JWT.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";

import {
  AgentRunBodySchema,
  ListAgentRunsQuerySchema,
  ToggleAgentBodySchema,
  AgentIdParamsSchema,
} from "../schemas/ai-agent.schema.js";
import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { aiAgentService } from "../services/ai-agent.service.js";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

function isManager(role: UserRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export async function aiAgentRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /ai-agents
   * List all available agents with today's runtime stats.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const agents = await aiAgentService.listAgents(payload.dealerId);
      return reply.send({ data: agents });
    },
  );

  /**
   * GET /ai-agents/:id
   * Get agent details plus recent runs.
   */
  app.get(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(AgentIdParamsSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;

      const result = await aiAgentService.getAgent(payload.dealerId, id);
      return reply.send({ data: result });
    },
  );

  /**
   * POST /ai-agents/:id/run
   * Trigger an agent run.
   */
  app.post(
    "/:id/run",
    {
      preHandler: [app.authenticate, validateParams(AgentIdParamsSchema), validateBody(AgentRunBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;
      const body = request.body as {
        entityType?: "LEAD" | "CUSTOMER" | "DEAL" | "VEHICLE";
        entityId?: string;
        action?: string;
        dryRun?: boolean;
      };

      const result = await aiAgentService.runAgent(payload.dealerId, id, {
        entityType: body.entityType,
        entityId: body.entityId,
        action: body.action,
        dryRun: body.dryRun,
      });

      return reply.status(201).send({ data: result });
    },
  );

  /**
   * GET /ai-agents/:id/runs
   * Paginated run history for an agent.
   */
  app.get(
    "/:id/runs",
    {
      preHandler: [app.authenticate, validateParams(AgentIdParamsSchema), validateQuery(ListAgentRunsQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;
      const q = (
        request as unknown as { validatedQuery: import("zod").infer<typeof ListAgentRunsQuerySchema> }
      ).validatedQuery;

      const result = await aiAgentService.listRuns(payload.dealerId, id, {
        entityType: q.entityType,
        entityId: q.entityId,
        status: q.status,
        limit: q.limit,
        cursor: q.cursor,
      });

      return reply.send({ data: result.data, pagination: result.pagination });
    },
  );

  /**
   * GET /ai-agents/:id/metrics
   * Today's runtime metrics for an agent.
   */
  app.get(
    "/:id/metrics",
    {
      preHandler: [app.authenticate, validateParams(AgentIdParamsSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;

      const metrics = await aiAgentService.getMetrics(payload.dealerId, id);
      return reply.send({ data: metrics });
    },
  );

  /**
   * POST /ai-agents/:id/toggle
   * Enable or disable an agent (admin/manager only).
   */
  app.post(
    "/:id/toggle",
    {
      preHandler: [app.authenticate, validateParams(AgentIdParamsSchema), validateBody(ToggleAgentBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;

      if (!isManager(payload.role)) {
        return reply.status(403).send({ error: { message: "Forbidden" } });
      }

      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;
      const body = request.body as { isEnabled: boolean };

      await aiAgentService.toggleAgent(payload.dealerId, id, body.isEnabled);

      return reply.send({ data: { id, isEnabled: body.isEnabled } });
    },
  );
}

export default aiAgentRoutes;
