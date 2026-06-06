/**
 * Auth routes — /api/auth/*
 *
 * Public:  POST /auth/register, POST /auth/login, POST /auth/refresh,
 *          POST /auth/accept-invite
 * Private: POST /auth/logout, GET /auth/me, POST /auth/invite
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AcceptInviteBodySchema,
  InviteBodySchema,
  LoginBodySchema,
  LogoutBodySchema,
  RefreshBodySchema,
  RegisterBodySchema,
} from "../schemas/auth.schema.js";
import { validateBody } from "../utils/validate.js";
import { authService, toPublicUser } from "../services/auth.service.js";
import { userRepository } from "../repositories/user.repository.js";
import { NotFoundError } from "../utils/errors.js";
import type { UserRole } from "@prisma/client";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /auth/register
   * Public. Creates a dealer + first admin user.
   */
  app.post(
    "/register",
    { preHandler: validateBody(RegisterBodySchema) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        dealer: { name: string; subdomain: string };
        user: { email: string; name: string; password: string };
      };
      const result = await authService.register(app, body);
      void reply.header(
        "Set-Cookie",
        `refreshToken=${result.tokens.refreshToken}; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
      );
      return reply.status(201).send({
        data: { user: result.user, accessToken: result.tokens.accessToken, expiresIn: result.tokens.expiresIn },
      });
    },
  );

  /**
   * POST /auth/login
   * Public.
   */
  app.post(
    "/login",
    { preHandler: validateBody(LoginBodySchema) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { email: string; password: string };
      const result = await authService.login(app, body, request.requestContext);
      void reply.header(
        "Set-Cookie",
        `refreshToken=${result.tokens.refreshToken}; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
      );
      return reply.status(200).send({
        data: { user: result.user, accessToken: result.tokens.accessToken, expiresIn: result.tokens.expiresIn },
      });
    },
  );

  /**
   * POST /auth/refresh
   * Public. Exchanges a refresh token for a new access + refresh pair.
   */
  app.post(
    "/refresh",
    { preHandler: validateBody(RefreshBodySchema) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { refreshToken: string };
      const tokens = await authService.refresh(app, body.refreshToken);
      void reply.header(
        "Set-Cookie",
        `refreshToken=${tokens.refreshToken}; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
      );
      return reply.status(200).send({
        data: { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn },
      });
    },
  );

  /**
   * POST /auth/logout
   * Public (idempotent). Blocklists the refresh + access tokens.
   */
  app.post(
    "/logout",
    { preHandler: validateBody(LogoutBodySchema) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as { refreshToken?: string };
      const auth = request.headers.authorization;
      const accessToken =
        auth && auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : undefined;
      await authService.logout(body.refreshToken, accessToken, request.requestContext);
      void reply.header(
        "Set-Cookie",
        `refreshToken=; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=0`,
      );
      return reply.status(200).send({ data: { ok: true } });
    },
  );

  /**
   * GET /auth/me
   * Private. Returns the current user.
   */
  app.get(
    "/me",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const user = await userRepository.findById(payload.dealerId, payload.userId);
      if (!user) {
        throw new NotFoundError("User not found");
      }
      return reply.status(200).send({ data: toPublicUser(user) });
    },
  );

  /**
   * POST /auth/invite
   * Private. ADMIN or MANAGER only.
   */
  app.post(
    "/invite",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateBody(InviteBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as {
        email: string;
        name: string;
        role: UserRole;
        phone?: string;
      };
      const result = await authService.invite(
        payload.dealerId,
        { id: payload.userId, role: payload.role as UserRole },
        body,
        request.requestContext,
      );
      return reply.status(201).send({ data: result });
    },
  );

  /**
   * POST /auth/accept-invite
   * Public. Consumes the invite token and creates the user.
   */
  app.post(
    "/accept-invite",
    { preHandler: validateBody(AcceptInviteBodySchema) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { token: string; dealerId: string; password: string; name?: string };
      const result = await authService.acceptInviteWithApp(
        app,
        body.dealerId,
        body,
        request.requestContext,
      );
      void reply.header(
        "Set-Cookie",
        `refreshToken=${result.tokens.refreshToken}; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
      );
      return reply.status(201).send({
        data: { user: result.user, accessToken: result.tokens.accessToken, expiresIn: result.tokens.expiresIn },
      });
    },
  );
}
