/**
 * Pipeline stages routes — /api/v1/pipeline/stages/*
 *
 * Manage customizable lead/deal pipeline stages per dealer.
 * These stages define the visual columns in the CRM pipeline view.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { validateBody, validateParams } from "../utils/validate.js";
import { NotFoundError, ConflictError } from "../utils/errors.js";

function requireTenant(request: { tenant?: { dealerId: string; userId: string; role: string } | null }): { dealerId: string; userId: string; role: string } {
  if (!request.tenant) throw new NotFoundError("Tenant context required");
  return request.tenant;
}

/* ============================================================
 * Types
 * ============================================================ */

interface PipelineStage {
  id: string;
  dealerId: string;
  name: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory store for pipeline stages (would be replaced with Prisma once models are regenerated)
const stageStore = new Map<string, PipelineStage>();

/* ============================================================
 * Schemas
 * ============================================================ */

const StageIdParamSchema = z.object({
  id: z.string().cuid(),
});

const CreateStageSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).default("#6366f1"),
  sortOrder: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
});

const UpdateStageSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isDefault: z.boolean().optional(),
});

const ReorderStagesSchema = z.object({
  stages: z.array(
    z.object({
      id: z.string().cuid(),
      sortOrder: z.number().int().min(0),
    }),
  ),
});

/* ============================================================
 * Helpers
 * ============================================================ */

function toStageResponse(stage: PipelineStage) {
  return {
    id: stage.id,
    name: stage.name,
    color: stage.color,
    sortOrder: stage.sortOrder,
    isDefault: stage.isDefault,
    createdAt: stage.createdAt.toISOString(),
    updatedAt: stage.updatedAt.toISOString(),
  };
}

function generateId(): string {
  return `ps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/* ============================================================
 * Routes
 * ============================================================ */

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /pipeline/stages
   * List all pipeline stages for the dealer.
   */
  app.get(
    "/stages",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const stages = Array.from(stageStore.values())
        .filter((s) => s.dealerId === ctx.dealerId)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      return reply.status(200).send({
        data: stages.map(toStageResponse),
      });
    },
  );

  /**
   * POST /pipeline/stages
   * Create a new pipeline stage.
   */
  app.post(
    "/stages",
    {
      preHandler: [app.authenticate, validateBody(CreateStageSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const body = request.body as z.infer<typeof CreateStageSchema>;

      // Check for duplicate name
      const existing = Array.from(stageStore.values()).find(
        (s) => s.dealerId === ctx.dealerId && s.name === body.name
      );
      if (existing) {
        throw new ConflictError("A stage with this name already exists");
      }

      // If this is set as default, unset any existing default
      if (body.isDefault) {
        for (const stage of stageStore.values()) {
          if (stage.dealerId === ctx.dealerId && stage.isDefault) {
            stage.isDefault = false;
          }
        }
      }

      // Get next sort order if not provided
      let sortOrder = body.sortOrder;
      if (sortOrder === undefined) {
        const dealerStages = Array.from(stageStore.values()).filter(
          (s) => s.dealerId === ctx.dealerId
        );
        sortOrder = dealerStages.length > 0
          ? Math.max(...dealerStages.map((s) => s.sortOrder)) + 1
          : 0;
      }

      const stage: PipelineStage = {
        id: generateId(),
        dealerId: ctx.dealerId,
        name: body.name,
        color: body.color,
        sortOrder,
        isDefault: body.isDefault ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      stageStore.set(stage.id, stage);

      return reply.status(201).send({
        data: toStageResponse(stage),
      });
    },
  );

  /**
   * PUT /pipeline/stages/:id
   * Update a pipeline stage.
   */
  app.put(
    "/stages/:id",
    {
      preHandler: [app.authenticate, validateParams(StageIdParamSchema), validateBody(UpdateStageSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof StageIdParamSchema>;
      const body = request.body as z.infer<typeof UpdateStageSchema>;

      const stage = stageStore.get(id);
      if (!stage || stage.dealerId !== ctx.dealerId) {
        throw new NotFoundError("Stage not found");
      }

      // Check for duplicate name if changing
      if (body.name && body.name !== stage.name) {
        const duplicate = Array.from(stageStore.values()).find(
          (s) => s.dealerId === ctx.dealerId && s.name === body.name && s.id !== id
        );
        if (duplicate) {
          throw new ConflictError("A stage with this name already exists");
        }
      }

      // If setting as default, unset any existing default
      if (body.isDefault) {
        for (const s of stageStore.values()) {
          if (s.dealerId === ctx.dealerId && s.isDefault && s.id !== id) {
            s.isDefault = false;
          }
        }
      }

      // Apply updates
      if (body.name !== undefined) stage.name = body.name;
      if (body.color !== undefined) stage.color = body.color;
      if (body.isDefault !== undefined) stage.isDefault = body.isDefault;
      stage.updatedAt = new Date();

      return reply.status(200).send({ data: toStageResponse(stage) });
    },
  );

  /**
   * DELETE /pipeline/stages/:id
   * Delete a pipeline stage.
   */
  app.delete(
    "/stages/:id",
    {
      preHandler: [app.authenticate, validateParams(StageIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof StageIdParamSchema>;

      const stage = stageStore.get(id);
      if (!stage || stage.dealerId !== ctx.dealerId) {
        throw new NotFoundError("Stage not found");
      }

      stageStore.delete(id);
      return reply.status(204).send();
    },
  );

  /**
   * PATCH /pipeline/stages/reorder
   * Change the order of pipeline stages.
   */
  app.patch(
    "/stages/reorder",
    {
      preHandler: [app.authenticate, validateBody(ReorderStagesSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const body = request.body as z.infer<typeof ReorderStagesSchema>;

      // Update each stage's sort order
      for (const s of body.stages) {
        const stage = stageStore.get(s.id);
        if (stage && stage.dealerId === ctx.dealerId) {
          stage.sortOrder = s.sortOrder;
          stage.updatedAt = new Date();
        }
      }

      // Return updated stages
      const stages = Array.from(stageStore.values())
        .filter((s) => s.dealerId === ctx.dealerId)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      return reply.status(200).send({
        data: stages.map(toStageResponse),
      });
    },
  );
}

export default pipelineRoutes;
