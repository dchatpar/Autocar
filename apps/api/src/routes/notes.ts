/**
 * Note routes — /api/v1/notes/*
 *
 * Polymorphic notes attached to any CRM entity:
 *   POST   /notes                     — create (polymorphic: leadId/customerId/vehicleId/dealId)
 *   GET    /notes                     — list for entity or all (filterable)
 *   PUT    /notes/:id                 — update own note
 *   DELETE /notes/:id                 — delete own note (or admin/manager)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { noteService, type NoteEntityType } from "../services/note.service.js";
import { NotFoundError } from "../utils/errors.js";

/* ============================================================
 * Schemas
 * ============================================================ */

const NoteIdParamSchema = z.object({ id: z.string().min(1, "Note id is required") });

const CreateNoteBodySchema = z.object({
  content: z.string().trim().min(1, "content is required").max(5000),
  entityType: z.enum(["lead", "customer", "vehicle", "deal"]).optional(),
  entityId: z.string().min(1).optional(),
});

const UpdateNoteBodySchema = z.object({
  content: z.string().trim().min(1, "content is required").max(5000),
});

const ListNotesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  entityType: z.enum(["lead", "customer", "vehicle", "deal"]).optional(),
  entityId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  // If no entityType/entityId provided, returns all notes for the dealer
});

/* ============================================================
 * Helpers
 * ============================================================ */

function requireTenant(
  request: { tenant?: { dealerId: string; userId: string; role: string } | null },
): { dealerId: string; userId: string; role: string } {
  if (!request.tenant) throw new NotFoundError("Tenant context required");
  return request.tenant;
}

function toAuditContext(request: FastifyRequest) {
  const ctx = requireTenant(request);
  return {
    userId: ctx.userId,
    dealerId: ctx.dealerId,
    role: ctx.role,
    ipAddress: request.requestContext?.ipAddress ?? null,
    userAgent: request.requestContext?.userAgent ?? null,
    requestId: request.requestContext?.requestId ?? null,
  };
}

/* ============================================================
 * Routes
 * ============================================================ */

export async function notesRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /notes — create a note.
   * If entityType + entityId are provided, the note is attached to that entity.
   * Otherwise it's a standalone notepad entry.
   */
  app.post(
    "/",
    {
      preHandler: [app.authenticate, validateBody(CreateNoteBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const body = request.body as z.infer<typeof CreateNoteBodySchema>;
      const { dealerId } = requireTenant(request);

      const note = await noteService.create(ctx, {
        dealerId,
        userId: ctx.userId,
        content: body.content,
        entityType: body.entityType as NoteEntityType | null ?? null,
        entityId: body.entityId ?? null,
      });

      // Also log an Activity if attached to a CRM entity
      if (body.entityType && body.entityId) {
        const { prisma } = await import("../utils/prisma.js");
        await prisma.activity.create({
          data: {
            dealerId,
            entityType: body.entityType.toUpperCase() as "LEAD" | "CUSTOMER" | "VEHICLE" | "DEAL",
            entityId: body.entityId,
            type: "NOTE",
            body: body.content,
            authorId: ctx.userId,
          },
        });
      }

      return reply.status(201).send({ data: note });
    },
  );

  /**
   * GET /notes — list notes.
   * If entityType + entityId are provided, returns notes for that entity.
   * Otherwise returns all notes for the dealer.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListNotesQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dealerId } = requireTenant(request);
      const q = (request as { validatedQuery?: z.infer<typeof ListNotesQuerySchema> })
        .validatedQuery as z.infer<typeof ListNotesQuerySchema>;

      let result: Awaited<ReturnType<typeof noteService.listForEntity>>;

      if (q.entityType && q.entityId) {
        result = await noteService.listForEntity(dealerId, {
          entityType: q.entityType as NoteEntityType,
          entityId: q.entityId,
          userId: q.userId,
        }, {
          cursor: q.cursor,
          limit: q.limit,
        });
      } else {
        result = await noteService.listAll(dealerId, {
          cursor: q.cursor,
          limit: q.limit,
        });
      }

      return reply.status(200).send({
        data: result.items,
        pagination: result.pagination,
      });
    },
  );

  /**
   * PUT /notes/:id — update a note (own notes only).
   */
  app.put(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        validateParams(NoteIdParamSchema),
        validateBody(UpdateNoteBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof NoteIdParamSchema>;
      const body = request.body as z.infer<typeof UpdateNoteBodySchema>;
      const { dealerId } = requireTenant(request);

      const updated = await noteService.update(ctx, dealerId, id, ctx.userId, {
        content: body.content,
      });

      return reply.status(200).send({ data: updated });
    },
  );

  /**
   * DELETE /notes/:id — delete a note (own notes, or admin/manager).
   */
  app.delete(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(NoteIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof NoteIdParamSchema>;
      const { dealerId, role } = requireTenant(request);

      await noteService.delete(ctx, dealerId, id, ctx.userId, role);
      return reply.status(204).send();
    },
  );
}
