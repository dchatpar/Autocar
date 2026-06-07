/**
 * Auth plugin — registers @fastify/jwt and exposes `authenticate()` and
 * `authorize(roles[])` decorators used by every protected route.
 *
 * Token model:
 *   - access:  15 min, payload = { userId, dealerId, role }
 *   - refresh: 7 days,  payload = { userId }
 *
 * The plugin does NOT do tenant scoping (that's plugins/tenant.ts). It only
 * verifies the bearer token and surfaces a typed `request.user` payload.
 */

import fp from "fastify-plugin";
import jwtPlugin from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";

import { AuthError, ForbiddenError } from "../utils/errors.js";

export interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
  iat?: number;
  exp?: number;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (roles: ReadonlyArray<UserRole | string>) => preHandlerHook;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessPayload | { userId: string } | { jti?: string };
    user: AccessPayload;
  }
}

// fastify-plugin requires this signature
type preHandlerHook = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;

const authPlugin = fp(
  async (app: FastifyInstance): Promise<void> => {
    const secret = process.env.AUTH_JWT_SECRET ?? "dev-secret-change-me";

    await app.register(jwtPlugin, {
      secret,
      sign: {
        // Access tokens default to 15m, refresh tokens override per-call.
        expiresIn: "15m",
      },
      verify: {
        extractToken: (req: FastifyRequest): string | undefined => {
          const auth = req.headers.authorization;
          if (auth && auth.startsWith("Bearer ")) {
            return auth.slice("Bearer ".length).trim();
          }
          return undefined;
        },
      },
    });

    /**
     * authenticate — verifies the bearer token and populates request.user.
     * Must be the first preHandler on every protected route.
     */
    app.decorate(
      "authenticate",
      async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
        try {
          await request.jwtVerify();
        } catch {
          throw new AuthError("Invalid or expired token");
        }

        const payload = request.user as AccessPayload | undefined;
        if (!payload || typeof payload.userId !== "string") {
          throw new AuthError("Malformed token payload");
        }
        if (typeof payload.dealerId !== "string") {
          throw new AuthError("Token missing tenant context");
        }
      },
    );

    /**
     * authorize — RBAC gate. Must be used AFTER authenticate.
     *
     * Usage:
     *   app.get("/admin-only", { preHandler: [app.authenticate, app.authorize(["ADMIN"])] }, ...)
     */
    app.decorate("authorize", (roles: ReadonlyArray<UserRole | string>) => {
      return async (
        request: FastifyRequest,
        _reply: FastifyReply,
      ): Promise<void> => {
        const payload = request.user as AccessPayload | undefined;
        if (!payload) {
          throw new AuthError("Authentication required");
        }
        const userRole = payload.role;
        if (!roles.includes(userRole)) {
          throw new ForbiddenError("Insufficient role");
        }
      };
    });
  },
  { name: "auth" },
);

export default authPlugin;
