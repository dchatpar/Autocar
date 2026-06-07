/**
 * User management routes — /api/users/*
 *
 * All routes require authentication. RBAC:
 *   - GET  /users         — any authenticated user (sees own dealer only)
 *   - GET  /users/:id     — any authenticated user
 *   - PUT  /users/:id     — admin/manager, or self (limited fields)
 *   - DELETE /users/:id   — admin only (soft delete)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";

import {
  ListUsersQuerySchema,
  UpdateUserBodySchema,
  UserIdParamSchema,
} from "../schemas/auth.schema.js";
import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { userService } from "../services/user.service.js";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /users
   * List users in the current dealer.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListUsersQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const query = (request as { validatedQuery?: unknown }).validatedQuery as {
        cursor?: string;
        limit: number;
        role?: UserRole;
        status?: "ACTIVE" | "INVITED" | "DISABLED";
        search?: string;
      };
      const result = await userService.list(payload.dealerId, query);
      return reply.status(200).send({
        data: result.items,
        pagination: result.pagination,
      });
    },
  );

  /**
   * GET /users/:id
   */
  app.get(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(UserIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const params = request.params as { id: string };
      const user = await userService.getById(payload.dealerId, params.id);
      return reply.status(200).send({ data: user });
    },
  );

  /**
   * PUT /users/:id
   * Admin/manager, or self.
   */
  app.put(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        validateParams(UserIdParamSchema),
        validateBody(UpdateUserBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const params = request.params as { id: string };
      const body = request.body as {
        name?: string;
        phone?: string | null;
        role?: UserRole;
        status?: "ACTIVE" | "INVITED" | "DISABLED";
        permissions?: string[];
      };
      const user = await userService.update(
        payload.dealerId,
        { id: payload.userId, role: payload.role as UserRole },
        params.id,
        body,
      );
      return reply.status(200).send({ data: user });
    },
  );

  /**
   * DELETE /users/:id
   * Admin only. Soft delete.
   */
  app.delete(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN"]),
        validateParams(UserIdParamSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const params = request.params as { id: string };
      await userService.softDelete(
        payload.dealerId,
        { id: payload.userId, role: payload.role as UserRole },
        params.id,
      );
      return reply.status(204).send();
    },
  );
}
