/**
 * Dealer profile routes — /api/dealer
 *
 * GET  /dealer — any authenticated user (read own dealer)
 * PUT  /dealer — admin only
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { UpdateDealerBodySchema } from "../schemas/auth.schema.js";
import { validateBody } from "../utils/validate.js";
import { dealerRepository } from "../repositories/dealer.repository.js";
import { NotFoundError } from "../utils/errors.js";
import type { UserRole } from "@prisma/client";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

export async function dealerRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /dealer
   * Returns the current dealer's profile.
   */
  app.get(
    "/",
    { preHandler: [app.authenticate], config: { requireTenant: true } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const dealer = await dealerRepository.findById(payload.dealerId);
      if (!dealer) {
        throw new NotFoundError("Dealer not found");
      }
      return reply.status(200).send({
        data: {
          id: dealer.id,
          name: dealer.name,
          subdomain: dealer.subdomain,
          plan: dealer.plan,
          settings: dealer.settings,
          trialEndsAt: dealer.trialEndsAt ? dealer.trialEndsAt.toISOString() : null,
          createdAt: dealer.createdAt.toISOString(),
          updatedAt: dealer.updatedAt.toISOString(),
        },
      });
    },
  );

  /**
   * PUT /dealer
   * Admin only.
   */
  app.put(
    "/",
    {
      preHandler: [app.authenticate, app.authorize(["ADMIN"]), validateBody(UpdateDealerBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as {
        name?: string;
        settings?: Record<string, unknown>;
      };
      const updated = await dealerRepository.update(payload.dealerId, {
        name: body.name,
        settings: body.settings as Prisma.InputJsonValue | undefined,
      });
      return reply.status(200).send({
        data: {
          id: updated.id,
          name: updated.name,
          subdomain: updated.subdomain,
          plan: updated.plan,
          settings: updated.settings,
          trialEndsAt: updated.trialEndsAt ? updated.trialEndsAt.toISOString() : null,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    },
  );
}
