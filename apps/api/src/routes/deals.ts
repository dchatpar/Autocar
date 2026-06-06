/**
 * Deal-scoped route surface.
 *
 * Some Deal-related endpoints are owned by feature modules
 * (signatures, F&I products, documents). Mounting them under
 * `/deals/:id/...` keeps the URL surface RESTful without each
 * module having to know about the others.
 *
 * Today this file is small — it's the home of the deal-scoped
 * signature listing endpoint. Add new deal-scoped endpoints
 * here as the deal desk grows.
 */

import type { FastifyInstance } from "fastify";
import { AuthError } from "../utils/errors.js";
import { signatureService } from "../services/signature.service.js";
import { DealIdParamSchema } from "../schemas/signature.schema.js";
import { z } from "zod";
import { validateParams } from "../utils/validate.js";

function requireTenant(request: { tenant?: { dealerId: string; userId: string; role: string } | null }): { dealerId: string; userId: string; role: string } {
  if (!request.tenant) throw new AuthError("Tenant context required");
  return request.tenant;
}

export async function dealScopedRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /deals/:id/signatures — list all envelopes for a deal.
   * Used by `/deals/[id]/signatures` page.
   */
  app.get(
    "/:id/signatures",
    {
      preHandler: [app.authenticate, validateParams(DealIdParamSchema)],
    },
    async (request, reply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof DealIdParamSchema>;
      const data = await signatureService.listForDeal(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        id,
      );
      return reply.send({ data, pagination: { hasMore: false, count: data.length } });
    },
  );
}
