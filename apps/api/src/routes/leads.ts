/**
 * Lead routes — /api/v1/leads/*
 *
 * Full CRUD + pipeline actions:
 *   POST   /leads                     — create
 *   GET    /leads                     — list (filterable, paginated)
 *   GET    /leads/:id                 — get one
 *   PUT    /leads/:id                 — update
 *   PATCH  /leads/:id/status          — change stage
 *   POST   /leads/:id/assign          — assign to user
 *   POST   /leads/:id/note            — add note (legacy alias → /notes)
 *   GET    /leads/:id/activities      — activity timeline
 *   GET    /leads/:id/score           — current score + breakdown
 *   POST   /leads/:id/convert         — convert to customer
 *   DELETE /leads/:id                 — soft delete (admin/manager)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { LeadStatus, Prisma } from "@prisma/client";

import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { leadService } from "../services/lead.service.js";
import { customerService } from "../services/customer.service.js";
import { prisma } from "../utils/prisma.js";
import { NotFoundError } from "../utils/errors.js";

/* ============================================================
 * Schemas
 * ============================================================ */

const LeadIdParamSchema = z.object({ id: z.string().min(1, "Lead id is required") });

const CreateLeadBodySchema = z.object({
  firstName: z.string().trim().min(1, "firstName is required").max(60),
  lastName: z.string().trim().min(1, "lastName is required").max(60),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  phone: z.string().trim().min(7).max(32).optional().nullable(),
  source: z.string().trim().max(80).optional().nullable(),
  score: z.number().int().min(0).max(100).optional(),
  status: z.enum(["NEW", "CONTACTED", "APPOINTMENT", "DEMO", "DEAL", "LOST"]).optional(),
  assignedToId: z.string().min(1).optional().nullable(),
  vehicleInterest: z.record(z.unknown()).optional(),
  sourceMeta: z.record(z.unknown()).optional(),
});

const UpdateLeadBodySchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  phone: z.string().trim().min(7).max(32).optional().nullable(),
  score: z.number().int().min(0).max(100).optional(),
  status: z.enum(["NEW", "CONTACTED", "APPOINTMENT", "DEMO", "DEAL", "LOST"]).optional(),
  assignedToId: z.string().min(1).optional().nullable(),
  vehicleInterest: z.record(z.unknown()).optional(),
  sourceMeta: z.record(z.unknown()).optional(),
});

const ChangeStatusBodySchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "APPOINTMENT", "DEMO", "DEAL", "LOST"]),
});

const AssignLeadBodySchema = z.object({
  assignedToId: z.string().min(1, "assignedToId is required").nullable(),
});

const ListLeadsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["NEW", "CONTACTED", "APPOINTMENT", "DEMO", "DEAL", "LOST"]).optional(),
  source: z.string().trim().max(80).optional(),
  assignedToId: z.string().min(1).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  classification: z.enum(["cold", "warm", "hot"]).optional(),
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

export async function leadsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /leads — create a new lead.
   */
  app.post(
    "/",
    {
      preHandler: [app.authenticate, validateBody(CreateLeadBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const body = request.body as z.infer<typeof CreateLeadBodySchema>;
      const { dealerId } = requireTenant(request);

      const lead = await leadService.create(
        ctx,
        {
          dealerId,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email ?? null,
          phone: body.phone ?? null,
          source: body.source ?? null,
          score: body.score,
          status: body.status as LeadStatus | undefined,
          assignedToId: body.assignedToId ?? null,
          vehicleInterest: (body.vehicleInterest ?? undefined) as Prisma.InputJsonValue | undefined,
          sourceMeta: (body.sourceMeta ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        { id: ctx.userId },
      );

      return reply.status(201).send({ data: serializeLead(lead) });
    },
  );

  /**
   * GET /leads — list leads with filters and cursor pagination.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListLeadsQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dealerId } = requireTenant(request);
      const q = (request as { validatedQuery?: z.infer<typeof ListLeadsQuerySchema> }).validatedQuery as z.infer<typeof ListLeadsQuerySchema>;

      const where: Prisma.LeadWhereInput = { dealerId };

      if (q.search) {
        const s = q.search.trim();
        where.OR = [
          { firstName: { contains: s, mode: "insensitive" } },
          { lastName: { contains: s, mode: "insensitive" } },
          { email: { contains: s, mode: "insensitive" } },
          { phone: { contains: s, mode: "insensitive" } },
        ];
      }
      if (q.status) where.status = q.status;
      if (q.source) where.source = q.source;
      if (q.assignedToId) where.assignedToId = q.assignedToId;
      if (q.minScore !== undefined) where.currentScore = { ...where.currentScore as object, gte: q.minScore };
      if (q.maxScore !== undefined) where.currentScore = { ...where.currentScore as object, lte: q.maxScore };
      if (q.classification) where.classification = q.classification;

      const rows = await prisma.lead.findMany({
        where,
        orderBy: [{ currentScore: "desc" }, { createdAt: "desc" }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: { assignedTo: { select: { id: true, name: true } } },
      });

      const hasMore = rows.length > q.limit;
      const items = hasMore ? rows.slice(0, q.limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return reply.status(200).send({
        data: items.map(serializeLead),
        pagination: { hasMore, cursor: nextCursor },
      });
    },
  );

  /**
   * GET /leads/:id — get a single lead.
   */
  app.get(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(LeadIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dealerId } = requireTenant(request);
      const { id } = request.params as z.infer<typeof LeadIdParamSchema>;

      const lead = await prisma.lead.findFirst({
        where: { id, dealerId },
        include: { assignedTo: { select: { id: true, name: true, email: true } } },
      });
      if (!lead) throw new NotFoundError("Lead not found");

      return reply.status(200).send({ data: serializeLead(lead) });
    },
  );

  /**
   * PUT /leads/:id — full update.
   */
  app.put(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        validateParams(LeadIdParamSchema),
        validateBody(UpdateLeadBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof LeadIdParamSchema>;
      const body = request.body as z.infer<typeof UpdateLeadBodySchema>;
      const { dealerId } = requireTenant(request);

      const updated = await leadService.update(
        ctx,
        dealerId,
        id,
        {
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone,
          score: body.score,
          status: body.status as LeadStatus | undefined,
          assignedToId: body.assignedToId,
          vehicleInterest: (body.vehicleInterest ?? undefined) as Prisma.InputJsonValue | undefined,
          sourceMeta: (body.sourceMeta ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      );

      return reply.status(200).send({ data: serializeLead(updated) });
    },
  );

  /**
   * PATCH /leads/:id/status — change lead stage.
   */
  app.patch(
    "/:id/status",
    {
      preHandler: [
        app.authenticate,
        validateParams(LeadIdParamSchema),
        validateBody(ChangeStatusBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof LeadIdParamSchema>;
      const body = request.body as z.infer<typeof ChangeStatusBodySchema>;
      const { dealerId } = requireTenant(request);

      const updated = await leadService.changeStatus(
        ctx,
        dealerId,
        id,
        body.status as LeadStatus,
      );

      return reply.status(200).send({ data: serializeLead(updated) });
    },
  );

  /**
   * POST /leads/:id/assign — assign lead to a user.
   */
  app.post(
    "/:id/assign",
    {
      preHandler: [
        app.authenticate,
        validateParams(LeadIdParamSchema),
        validateBody(AssignLeadBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof LeadIdParamSchema>;
      const body = request.body as z.infer<typeof AssignLeadBodySchema>;
      const { dealerId } = requireTenant(request);

      const updated = await leadService.assign(
        ctx,
        dealerId,
        id,
        body.assignedToId,
        ctx.userId,
      );

      return reply.status(200).send({ data: serializeLead(updated) });
    },
  );

  /**
   * POST /leads/:id/note — add a note to a lead (legacy alias → POST /notes).
   * Redirected to the notes service internally.
   */
  app.post(
    "/:id/note",
    {
      preHandler: [
        app.authenticate,
        validateParams(LeadIdParamSchema),
        validateBody(z.object({ content: z.string().trim().min(1, "content is required").max(5000) })),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof LeadIdParamSchema>;
      const body = request.body as { content: string };
      const { dealerId } = requireTenant(request);

      // Verify lead exists under this tenant
      const lead = await prisma.lead.findFirst({ where: { id, dealerId }, select: { id: true } });
      if (!lead) throw new NotFoundError("Lead not found");

      const { noteService } = await import("../services/note.service.js");
      const note = await noteService.create(ctx, {
        dealerId,
        userId: ctx.userId,
        content: body.content,
        entityType: "lead",
        entityId: id,
      });

      // Also log as an Activity
      await prisma.activity.create({
        data: {
          dealerId,
          entityType: "LEAD",
          entityId: id,
          type: "NOTE",
          body: body.content,
          authorId: ctx.userId,
        },
      });

      return reply.status(201).send({ data: note });
    },
  );

  /**
   * GET /leads/:id/activities — activity timeline for the lead.
   */
  app.get(
    "/:id/activities",
    {
      preHandler: [app.authenticate, validateParams(LeadIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as z.infer<typeof LeadIdParamSchema>;
      const { dealerId } = requireTenant(request);

      const lead = await prisma.lead.findFirst({ where: { id, dealerId }, select: { id: true } });
      if (!lead) throw new NotFoundError("Lead not found");

      const activities = await prisma.activity.findMany({
        where: { dealerId, entityType: "LEAD", entityId: id },
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true } } },
      });

      return reply.status(200).send({
        data: activities.map((a) => ({
          id: a.id,
          type: a.type,
          body: a.body,
          metadata: a.metadata,
          author: a.author ? { id: a.author.id, name: a.author.name } : null,
          createdAt: a.createdAt.toISOString(),
        })),
      });
    },
  );

  /**
   * GET /leads/:id/score — current score breakdown.
   */
  app.get(
    "/:id/score",
    {
      preHandler: [app.authenticate, validateParams(LeadIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as z.infer<typeof LeadIdParamSchema>;
      const { dealerId } = requireTenant(request);

      const lead = await prisma.lead.findFirst({
        where: { id, dealerId },
        select: { id: true, currentScore: true, classification: true, lastScoredAt: true },
      });
      if (!lead) throw new NotFoundError("Lead not found");

      // Get the latest score history row for signal breakdown
      const latestScore = await prisma.leadScore.findFirst({
        where: { dealerId, leadId: id },
        orderBy: { scoredAt: "desc" },
        select: { score: true, classification: true, signals: true, scoredAt: true },
      });

      return reply.status(200).send({
        data: {
          currentScore: lead.currentScore,
          classification: lead.classification,
          lastScoredAt: lead.lastScoredAt?.toISOString() ?? null,
          breakdown: latestScore?.signals ?? {},
        },
      });
    },
  );

  /**
   * POST /leads/:id/convert — convert lead to customer.
   */
  app.post(
    "/:id/convert",
    {
      preHandler: [app.authenticate, validateParams(LeadIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof LeadIdParamSchema>;
      const { dealerId } = requireTenant(request);

      const lead = await prisma.lead.findFirst({ where: { id, dealerId } });
      if (!lead) throw new NotFoundError("Lead not found");

      // Create a customer from the lead data
      const customer = await customerService.create(ctx, {
        dealerId,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        tags: [`converted-from-lead:${lead.source ?? "unknown"}`],
      });

      // Link the lead to the customer and mark as DEAL
      await prisma.lead.update({
        where: { id },
        data: { customerId: customer.id, status: "DEAL" },
      });

      return reply.status(201).send({
        data: {
          leadId: id,
          customerId: customer.id,
          customer: {
            id: customer.id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email,
            phone: customer.phone,
          },
        },
      });
    },
  );

  /**
   * DELETE /leads/:id — soft delete (admin/manager only).
   */
  app.delete(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateParams(LeadIdParamSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof LeadIdParamSchema>;
      const { dealerId, role } = requireTenant(request);

      await leadService.delete(ctx, dealerId, id, { role });
      return reply.status(204).send();
    },
  );
}

/* ============================================================
 * Serialization helpers
 * ============================================================ */

function serializeLead(lead: {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  currentScore: number;
  classification: string;
  assignedToId: string | null;
  score: number;
  unsubscribed: boolean;
  bounced: boolean;
  createdAt: Date;
  updatedAt: Date;
  assignedTo?: { id: string; name: string | null } | null;
  [key: string]: unknown;
}): {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  currentScore: number;
  classification: string;
  assignedToId: string | null;
  score: number;
  unsubscribed: boolean;
  bounced: boolean;
  assignedTo: { id: string; name: string | null } | null;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
    currentScore: lead.currentScore,
    classification: lead.classification,
    assignedToId: lead.assignedToId,
    score: lead.score,
    unsubscribed: lead.unsubscribed,
    bounced: lead.bounced,
    assignedTo: lead.assignedTo
      ? { id: lead.assignedTo.id, name: lead.assignedTo.name ?? null }
      : null,
    createdAt: lead.createdAt instanceof Date ? lead.createdAt.toISOString() : String(lead.createdAt),
    updatedAt: lead.updatedAt instanceof Date ? lead.updatedAt.toISOString() : String(lead.updatedAt),
  };
}
