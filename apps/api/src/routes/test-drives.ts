/**
 * Test Drive routes — /api/v1/test-drives/*
 *
 * Thin wrappers around test-drive.service.ts (which internally
 * manages Appointment rows of type TEST_DRIVE):
 *   POST   /test-drives               — schedule
 *   GET    /test-drives               — list
 *   GET    /test-drives/:id           — get one
 *   PUT    /test-drives/:id           — update
 *   PATCH  /test-drives/:id/status    — change status
 *   POST   /test-drives/:id/complete  — mark complete
 *   DELETE /test-drives/:id           — delete
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { testDriveService } from "../services/test-drive.service.js";
import { NotFoundError } from "../utils/errors.js";

/* ============================================================
 * Schemas
 * ============================================================ */

const TestDriveIdParamSchema = z.object({ id: z.string().min(1, "Test drive id is required") });

const ScheduleTestDriveBodySchema = z.object({
  customerId: z.string().min(1, "customerId is required"),
  vehicleId: z.string().min(1, "vehicleId is required"),
  assignedToId: z.string().min(1).optional().nullable(),
  scheduledAt: z.string().datetime({ message: "scheduledAt must be an ISO timestamp" }),
  durationMin: z.number().int().min(15).max(240).optional().default(30),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const UpdateTestDriveBodySchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  durationMin: z.number().int().min(15).max(240).optional(),
  assignedToId: z.string().min(1).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const ChangeTestDriveStatusBodySchema = z.object({
  status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELLED"]),
});

const CompleteTestDriveBodySchema = z.object({
  sold: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const ListTestDrivesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  assignedToId: z.string().min(1).optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  customerId: z.string().min(1).optional(),
  vehicleId: z.string().min(1).optional(),
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

export async function testDrivesRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /test-drives — schedule a new test drive.
   */
  app.post(
    "/",
    {
      preHandler: [app.authenticate, validateBody(ScheduleTestDriveBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const body = request.body as z.infer<typeof ScheduleTestDriveBodySchema>;
      const { dealerId } = requireTenant(request);

      const testDrive = await testDriveService.schedule(ctx, {
        dealerId,
        customerId: body.customerId,
        vehicleId: body.vehicleId,
        assignedToId: body.assignedToId ?? null,
        scheduledAt: new Date(body.scheduledAt),
        durationMin: body.durationMin,
        notes: body.notes ?? null,
      });

      return reply.status(201).send({
        data: {
          id: testDrive.id,
          customerId: testDrive.customerId,
          scheduledAt: testDrive.scheduledAt.toISOString(),
          durationMin: testDrive.durationMin,
          status: testDrive.status,
          notes: testDrive.notes,
          createdAt: testDrive.createdAt.toISOString(),
        },
      });
    },
  );

  /**
   * GET /test-drives — list test drives.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListTestDrivesQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dealerId } = requireTenant(request);
      const q = (request as { validatedQuery?: z.infer<typeof ListTestDrivesQuerySchema> })
        .validatedQuery as z.infer<typeof ListTestDrivesQuerySchema>;

      const { appointmentService } = await import("../services/appointment.service.js");
      const result = await appointmentService.list(
        dealerId,
        {
          type: "TEST_DRIVE",
          startDate: q.startDate ? new Date(q.startDate) : undefined,
          endDate: q.endDate ? new Date(q.endDate) : undefined,
          assignedToId: q.assignedToId ?? undefined,
          status: q.status as Parameters<typeof appointmentService.list>[1]["status"] | undefined,
          customerId: q.customerId ?? undefined,
        },
        { cursor: q.cursor, limit: q.limit },
      );

      return reply.status(200).send({
        data: result.items.map((a) => ({
          id: a.id,
          customerId: a.customerId,
          leadId: a.leadId,
          assignedToId: a.assignedToId,
          scheduledAt: a.scheduledAt.toISOString(),
          durationMin: a.durationMin,
          status: a.status,
          notes: a.notes,
          createdAt: a.createdAt.toISOString(),
        })),
        pagination: result.pagination,
      });
    },
  );

  /**
   * GET /test-drives/:id — get a single test drive.
   */
  app.get(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(TestDriveIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dealerId } = requireTenant(request);
      const { id } = request.params as z.infer<typeof TestDriveIdParamSchema>;

      const { appointmentService } = await import("../services/appointment.service.js");
      const appointment = await appointmentService.getById(dealerId, id);
      if (!appointment || appointment.type !== "TEST_DRIVE") {
        throw new NotFoundError("Test drive not found");
      }

      return reply.status(200).send({
        data: {
          id: appointment.id,
          customerId: appointment.customerId,
          leadId: appointment.leadId,
          assignedToId: appointment.assignedToId,
          scheduledAt: appointment.scheduledAt.toISOString(),
          durationMin: appointment.durationMin,
          status: appointment.status,
          notes: appointment.notes,
          createdAt: appointment.createdAt.toISOString(),
        },
      });
    },
  );

  /**
   * PUT /test-drives/:id — update a test drive.
   */
  app.put(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        validateParams(TestDriveIdParamSchema),
        validateBody(UpdateTestDriveBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof TestDriveIdParamSchema>;
      const body = request.body as z.infer<typeof UpdateTestDriveBodySchema>;
      const { dealerId } = requireTenant(request);

      const { appointmentService } = await import("../services/appointment.service.js");
      const existing = await appointmentService.getById(dealerId, id);
      if (!existing || existing.type !== "TEST_DRIVE") {
        throw new NotFoundError("Test drive not found");
      }

      const updated = await appointmentService.update(ctx, dealerId, id, {
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
        durationMin: body.durationMin,
        assignedToId: body.assignedToId,
        notes: body.notes,
      });

      return reply.status(200).send({
        data: {
          id: updated.id,
          customerId: updated.customerId,
          leadId: updated.leadId,
          assignedToId: updated.assignedToId,
          scheduledAt: updated.scheduledAt.toISOString(),
          durationMin: updated.durationMin,
          status: updated.status,
          notes: updated.notes,
          createdAt: updated.createdAt.toISOString(),
        },
      });
    },
  );

  /**
   * PATCH /test-drives/:id/status — change test drive status.
   */
  app.patch(
    "/:id/status",
    {
      preHandler: [
        app.authenticate,
        validateParams(TestDriveIdParamSchema),
        validateBody(ChangeTestDriveStatusBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof TestDriveIdParamSchema>;
      const body = request.body as z.infer<typeof ChangeTestDriveStatusBodySchema>;
      const { dealerId } = requireTenant(request);

      const { appointmentService } = await import("../services/appointment.service.js");
      const existing = await appointmentService.getById(dealerId, id);
      if (!existing || existing.type !== "TEST_DRIVE") {
        throw new NotFoundError("Test drive not found");
      }

      const updated = await appointmentService.changeStatus(
        ctx,
        dealerId,
        id,
        body.status as "SCHEDULED" | "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "COMPLETED",
      );

      return reply.status(200).send({
        data: {
          id: updated.id,
          status: updated.status,
          updatedAt: updated.createdAt.toISOString(),
        },
      });
    },
  );

  /**
   * POST /test-drives/:id/complete — mark test drive complete.
   */
  app.post(
    "/:id/complete",
    {
      preHandler: [
        app.authenticate,
        validateParams(TestDriveIdParamSchema),
        validateBody(CompleteTestDriveBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof TestDriveIdParamSchema>;
      const body = request.body as z.infer<typeof CompleteTestDriveBodySchema>;
      const { dealerId } = requireTenant(request);

      const completed = await testDriveService.complete(ctx, dealerId, id, {
        sold: body.sold,
        notes: body.notes ?? null,
      });

      return reply.status(200).send({
        data: {
          id: completed.id,
          status: completed.status,
          notes: completed.notes,
        },
      });
    },
  );

  /**
   * DELETE /test-drives/:id — delete a test drive.
   */
  app.delete(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(TestDriveIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof TestDriveIdParamSchema>;
      const { dealerId } = requireTenant(request);

      const { appointmentService } = await import("../services/appointment.service.js");
      const existing = await appointmentService.getById(dealerId, id);
      if (!existing || existing.type !== "TEST_DRIVE") {
        throw new NotFoundError("Test drive not found");
      }

      await appointmentService.delete(ctx, dealerId, id);
      return reply.status(204).send();
    },
  );
}
