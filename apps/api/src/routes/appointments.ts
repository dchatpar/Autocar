/**
 * Appointment routes — /api/v1/appointments/*
 *
 * Calendar events / appointments:
 *   POST   /appointments              — create
 *   GET    /appointments              — list (filter by date range, userId, type)
 *   GET    /appointments/:id          — get one
 *   PUT    /appointments/:id          — update
 *   PATCH  /appointments/:id/status   — confirm/cancel/no-show
 *   DELETE /appointments/:id          — delete
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppointmentStatus, AppointmentType } from "@prisma/client";

import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { appointmentService } from "../services/appointment.service.js";
import { NotFoundError } from "../utils/errors.js";

/* ============================================================
 * Schemas
 * ============================================================ */

const AppointmentIdParamSchema = z.object({ id: z.string().min(1, "Appointment id is required") });

const CreateAppointmentBodySchema = z.object({
  leadId: z.string().min(1).optional().nullable(),
  customerId: z.string().min(1).optional().nullable(),
  assignedToId: z.string().min(1).optional().nullable(),
  type: z.enum(["SALES", "TEST_DRIVE", "SERVICE", "DELIVERY"]),
  scheduledAt: z.string().datetime({ message: "scheduledAt must be an ISO timestamp" }),
  durationMin: z.number().int().min(5).max(480).optional().default(30),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const UpdateAppointmentBodySchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  durationMin: z.number().int().min(5).max(480).optional(),
  assignedToId: z.string().min(1).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  type: z.enum(["SALES", "TEST_DRIVE", "SERVICE", "DELIVERY"]).optional(),
});

const ChangeStatusBodySchema = z.object({
  status: z.enum(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
});

const ListAppointmentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  assignedToId: z.string().min(1).optional(),
  type: z.enum(["SALES", "TEST_DRIVE", "SERVICE", "DELIVERY"]).optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  leadId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
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

export async function appointmentsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /appointments — create a new appointment.
   */
  app.post(
    "/",
    {
      preHandler: [app.authenticate, validateBody(CreateAppointmentBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const body = request.body as z.infer<typeof CreateAppointmentBodySchema>;
      const { dealerId } = requireTenant(request);

      const appointment = await appointmentService.create(ctx, {
        dealerId,
        leadId: body.leadId ?? null,
        customerId: body.customerId ?? null,
        assignedToId: body.assignedToId ?? null,
        type: body.type as AppointmentType,
        scheduledAt: new Date(body.scheduledAt),
        durationMin: body.durationMin,
        notes: body.notes ?? null,
      });

      return reply.status(201).send({ data: serializeAppointment(appointment) });
    },
  );

  /**
   * GET /appointments — list appointments with filters.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListAppointmentsQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dealerId } = requireTenant(request);
      const q = (request as { validatedQuery?: z.infer<typeof ListAppointmentsQuerySchema> })
        .validatedQuery as z.infer<typeof ListAppointmentsQuerySchema>;

      const result = await appointmentService.list(
        dealerId,
        {
          startDate: q.startDate ? new Date(q.startDate) : undefined,
          endDate: q.endDate ? new Date(q.endDate) : undefined,
          assignedToId: q.assignedToId ?? undefined,
          type: q.type as AppointmentType | undefined,
          status: q.status as AppointmentStatus | undefined,
          leadId: q.leadId ?? undefined,
          customerId: q.customerId ?? undefined,
        },
        { cursor: q.cursor, limit: q.limit },
      );

      return reply.status(200).send({
        data: result.items.map(serializeAppointment),
        pagination: result.pagination,
      });
    },
  );

  /**
   * GET /appointments/:id — get a single appointment.
   */
  app.get(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(AppointmentIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dealerId } = requireTenant(request);
      const { id } = request.params as z.infer<typeof AppointmentIdParamSchema>;

      const appointment = await appointmentService.getById(dealerId, id);
      if (!appointment) throw new NotFoundError("Appointment not found");

      return reply.status(200).send({ data: serializeAppointment(appointment) });
    },
  );

  /**
   * PUT /appointments/:id — update an appointment.
   */
  app.put(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        validateParams(AppointmentIdParamSchema),
        validateBody(UpdateAppointmentBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof AppointmentIdParamSchema>;
      const body = request.body as z.infer<typeof UpdateAppointmentBodySchema>;
      const { dealerId } = requireTenant(request);

      const updated = await appointmentService.update(ctx, dealerId, id, {
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
        durationMin: body.durationMin,
        assignedToId: body.assignedToId,
        notes: body.notes,
        type: body.type as AppointmentType | undefined,
      });

      return reply.status(200).send({ data: serializeAppointment(updated) });
    },
  );

  /**
   * PATCH /appointments/:id/status — confirm, cancel, or mark no-show.
   */
  app.patch(
    "/:id/status",
    {
      preHandler: [
        app.authenticate,
        validateParams(AppointmentIdParamSchema),
        validateBody(ChangeStatusBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof AppointmentIdParamSchema>;
      const body = request.body as z.infer<typeof ChangeStatusBodySchema>;
      const { dealerId } = requireTenant(request);

      const updated = await appointmentService.changeStatus(
        ctx,
        dealerId,
        id,
        body.status as AppointmentStatus,
      );

      return reply.status(200).send({ data: serializeAppointment(updated) });
    },
  );

  /**
   * DELETE /appointments/:id — delete an appointment.
   */
  app.delete(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(AppointmentIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof AppointmentIdParamSchema>;
      const { dealerId } = requireTenant(request);

      await appointmentService.delete(ctx, dealerId, id);
      return reply.status(204).send();
    },
  );
}

/* ============================================================
 * Serialization helpers
 * ============================================================ */

function serializeAppointment(a: {
  id: string;
  dealerId: string;
  leadId: string | null;
  customerId: string | null;
  assignedToId: string | null;
  type: string;
  scheduledAt: Date;
  durationMin: number;
  status: string;
  notes: string | null;
  createdAt: Date;
  [key: string]: unknown;
}): {
  id: string;
  dealerId: string;
  leadId: string | null;
  customerId: string | null;
  assignedToId: string | null;
  type: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  notes: string | null;
  createdAt: string;
} {
  return {
    id: a.id,
    dealerId: a.dealerId,
    leadId: a.leadId,
    customerId: a.customerId,
    assignedToId: a.assignedToId,
    type: a.type,
    scheduledAt: a.scheduledAt instanceof Date ? a.scheduledAt.toISOString() : String(a.scheduledAt),
    durationMin: a.durationMin,
    status: a.status,
    notes: a.notes,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
  };
}
