/**
 * Task routes — /api/tasks/*
 *
 * Mounted under `/tasks` (parent app.ts owns the prefix).
 *
 * All routes require authentication. RBAC:
 *   - GET  /tasks                — any authenticated user
 *   - GET  /tasks/:id           — any authenticated user
 *   - POST /tasks                — any authenticated user
 *   - PUT  /tasks/:id            — any authenticated user (creator or assignee)
 *   - PATCH /tasks/:id/status    — any authenticated user
 *   - DELETE /tasks/:id          — admin/manager only
 *
 * Multi-tenant: every Prisma call is scoped by `dealerId` from the JWT.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";

import {
  CreateTaskBodySchema,
  UpdateTaskBodySchema,
  PatchTaskStatusBodySchema,
  ListTasksQuerySchema,
  TaskIdParamsSchema,
} from "../schemas/task.schema.js";
import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { taskService } from "../services/task.service.js";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

function isManager(role: UserRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /tasks
   * Create a new task.
   */
  app.post(
    "/",
    {
      preHandler: [app.authenticate, validateBody(CreateTaskBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as {
        title: string;
        description?: string;
        type?: string;
        priority?: string;
        dueAt?: string;
        assignedToId?: string;
        leadId?: string;
        customerId?: string;
      };

      const task = await taskService.create(
        { dealerId: payload.dealerId, userId: payload.userId, role: payload.role },
        {
          dealerId: payload.dealerId,
          createdById: payload.userId,
          title: body.title,
          description: body.description,
          type: body.type as import("@prisma/client").TaskType | undefined,
          priority: body.priority as import("@prisma/client").TaskPriority | undefined,
          dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
          assignedToId: body.assignedToId,
          leadId: body.leadId,
          customerId: body.customerId,
        },
      );

      return reply.status(201).send({ data: task });
    },
  );

  /**
   * GET /tasks
   * List tasks with filters.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListTasksQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const q = (
        request as unknown as { validatedQuery: import("zod").infer<typeof ListTasksQuerySchema> }
      ).validatedQuery;

      const result = await taskService.list(payload.dealerId, {
        assigneeId: q.assigneeId,
        status: q.status ?? undefined,
        priority: q.priority ?? undefined,
        type: q.type ?? undefined,
        dueBefore: q.dueBefore ? new Date(q.dueBefore as string) : undefined,
        dueAfter: q.dueAfter ? new Date(q.dueAfter as string) : undefined,
        leadId: q.leadId,
        customerId: q.customerId,
        limit: q.limit,
        cursor: q.cursor,
      });

      return reply.send({ data: result.data, pagination: result.pagination });
    },
  );

  /**
   * GET /tasks/:id
   * Get a single task.
   */
  app.get(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(TaskIdParamsSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;

      const task = await taskService.getById(payload.dealerId, id);
      return reply.send({ data: task });
    },
  );

  /**
   * PUT /tasks/:id
   * Update a task.
   */
  app.put(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(TaskIdParamsSchema), validateBody(UpdateTaskBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;
      const body = request.body as {
        title?: string;
        description?: string | null;
        type?: string;
        priority?: string;
        status?: string;
        dueAt?: string | null;
        assignedToId?: string | null;
        leadId?: string | null;
        customerId?: string | null;
      };

      const task = await taskService.update(
        { dealerId: payload.dealerId, userId: payload.userId, role: payload.role },
        payload.dealerId,
        id,
        {
          title: body.title,
          description: body.description,
          type: body.type as import("@prisma/client").TaskType | undefined,
          priority: body.priority as import("@prisma/client").TaskPriority | undefined,
          status: body.status as import("@prisma/client").TaskStatus | undefined,
          dueAt: body.dueAt ? new Date(body.dueAt) : (body.dueAt === null ? null : undefined),
          assignedToId: body.assignedToId,
          leadId: body.leadId,
          customerId: body.customerId,
        },
      );

      return reply.send({ data: task });
    },
  );

  /**
   * PATCH /tasks/:id/status
   * Update just the status of a task.
   */
  app.patch(
    "/:id/status",
    {
      preHandler: [app.authenticate, validateParams(TaskIdParamsSchema), validateBody(PatchTaskStatusBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;
      const body = request.body as { status: "OPEN" | "COMPLETED" | "CANCELLED" };

      const task = await taskService.updateStatus(
        { dealerId: payload.dealerId, userId: payload.userId, role: payload.role },
        payload.dealerId,
        id,
        body.status as import("@prisma/client").TaskStatus,
      );

      return reply.send({ data: task });
    },
  );

  /**
   * DELETE /tasks/:id
   * Delete a task. Admin/manager only.
   */
  app.delete(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(TaskIdParamsSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;

      if (!isManager(payload.role)) {
        return reply.status(403).send({ error: { message: "Forbidden" } });
      }

      const { id } = (request as unknown as { validatedParams: { id: string } }).validatedParams;
      await taskService.delete(
        { dealerId: payload.dealerId, userId: payload.userId, role: payload.role },
        payload.dealerId,
        id,
      );

      return reply.status(204).send();
    },
  );
}

// Alias for backward compatibility with existing app.ts imports
export const tasksRoutes = taskRoutes;
export default taskRoutes;
