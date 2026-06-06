/**
 * DealerWebsite routes
 *
 * Authenticated (dealer-staff) routes:
 *   GET    /dealer-website           — read current dealer's site config
 *   POST   /dealer-website           — create (admin)
 *   PUT    /dealer-website           — update (admin / manager)
 *   POST   /dealer-website/publish   — toggle publishing (admin)
 *   DELETE /dealer-website           — delete (admin)
 *
 * Public routes (called by the marketing app):
 *   GET    /public/dealer-website/:subdomain       — resolve site by subdomain
 *   GET    /public/dealer-website/by-host/:host    — resolve site by custom domain
 *   POST   /public/dealer-website/:subdomain/lead  — capture a contact-form lead
 *   POST   /public/dealer-website/:subdomain/finance-application
 *
 * Every public endpoint is rate-limited through the global @fastify/rate-limit
 * plugin. Authenticated endpoints are tenant-scoped via `request.tenant`
 * (set by plugins/tenant.ts).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CreateDealerWebsiteBodySchema,
  UpdateDealerWebsiteBodySchema,
  FinanceApplicationBodySchema,
  PublicLeadBodySchema,
  SubdomainParamSchema,
} from "../schemas/dealer-website.schema.js";
import {
  validateBody,
  validateParams,
} from "../utils/validate.js";
import { dealerWebsiteService } from "../services/dealer-website.service.js";
import { NotFoundError } from "../utils/errors.js";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: string;
}

/* ============================================================
 * Response serializer
 * ============================================================ */

function serializeWebsite(
  w: import("@prisma/client").DealerWebsite,
): Record<string, unknown> {
  return {
    id: w.id,
    dealerId: w.dealerId,
    subdomain: w.subdomain,
    themeConfig: w.themeConfig,
    seoConfig: w.seoConfig,
    customDomain: w.customDomain,
    isPublished: w.isPublished,
    viewCount: w.viewCount,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

/* ============================================================
 * Authenticated routes
 * ============================================================ */

export async function dealerWebsiteRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /dealer-website
   * Read the current dealer's website config. Any authenticated user
   * in the tenant can read; only admin/manager can mutate.
   */
  app.get(
    "/",
    { preHandler: [app.authenticate], config: { requireTenant: true } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const site = await dealerWebsiteService.getForDealer(payload.dealerId);
      if (!site) {
        return reply.status(200).send({ data: null });
      }
      return reply.status(200).send({ data: serializeWebsite(site) });
    },
  );

  /**
   * POST /dealer-website
   * Admin only. Create the website row.
   */
  app.post(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN"]),
        validateBody(CreateDealerWebsiteBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as {
        subdomain: string;
        themeConfig?: Record<string, unknown>;
        seoConfig?: Record<string, unknown>;
        customDomain?: string;
        isPublished?: boolean;
      };
      const created = await dealerWebsiteService.create(
        {
          userId: payload.userId,
          dealerId: payload.dealerId,
          role: payload.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        payload.dealerId,
        body,
      );
      return reply.status(201).send({ data: serializeWebsite(created) });
    },
  );

  /**
   * PUT /dealer-website
   * Admin or Manager. Update theme / SEO / subdomain / custom domain.
   */
  app.put(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateBody(UpdateDealerWebsiteBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as {
        subdomain?: string;
        themeConfig?: Record<string, unknown>;
        seoConfig?: Record<string, unknown>;
        customDomain?: string | null;
        isPublished?: boolean;
      };
      const updated = await dealerWebsiteService.update(
        {
          userId: payload.userId,
          dealerId: payload.dealerId,
          role: payload.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        payload.dealerId,
        body,
      );
      return reply.status(200).send({ data: serializeWebsite(updated) });
    },
  );

  /**
   * POST /dealer-website/publish
   * Admin or Manager. Toggle publishing.
   */
  app.post(
    "/publish",
    {
      preHandler: [app.authenticate, app.authorize(["ADMIN", "MANAGER"])],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = (request.body ?? {}) as { isPublished?: boolean };
      const next = body.isPublished === true;
      const updated = await dealerWebsiteService.setPublished(
        {
          userId: payload.userId,
          dealerId: payload.dealerId,
          role: payload.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        payload.dealerId,
        next,
      );
      return reply.status(200).send({ data: serializeWebsite(updated) });
    },
  );

  /**
   * DELETE /dealer-website
   * Admin only. Hard delete the website row.
   */
  app.delete(
    "/",
    {
      preHandler: [app.authenticate, app.authorize(["ADMIN"])],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      await dealerWebsiteService.delete(
        {
          userId: payload.userId,
          dealerId: payload.dealerId,
          role: payload.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        payload.dealerId,
      );
      return reply.status(204).send();
    },
  );

  /**
   * POST /dealer-website/view
   * Called by the marketing app on every page view to bump the
   * counter. Authenticated as the dealer's service token (set via
   * a separate env-bound secret for now, but for Phase 1 we accept
   * the call without a JWT — protected only by subdomain validity).
   */
  app.post(
    "/view",
    {
      preHandler: [app.authenticate, app.authorize(["ADMIN", "MANAGER", "SALES", "BDC", "FINANCE"])],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      await dealerWebsiteService.trackView(payload.dealerId);
      return reply.status(204).send();
    },
  );
}

/* ============================================================
 * Public routes
 * ============================================================ */

export async function publicDealerWebsiteRoutes(
  app: FastifyInstance,
): Promise<void> {
  /**
   * GET /public/dealer-website/:subdomain
   * Resolves the public site config for the marketing app. Returns
   * 404 if the subdomain has no published site.
   */
  app.get(
    "/:subdomain",
    { preHandler: [validateParams(SubdomainParamSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { subdomain: string };
      const site = await dealerWebsiteService.resolveBySubdomain(params.subdomain);
      if (!site) {
        throw new NotFoundError(`No site for subdomain '${params.subdomain}'`);
      }
      // Don't leak unpublished sites to the public.
      if (!site.website.isPublished) {
        // For now: 404 if unpublished. (Could render a "coming soon"
        // page instead — but for SEO we want crawlers to see 404.)
        throw new NotFoundError(`Site is not published`);
      }
      // Best-effort view counter.
      void dealerWebsiteService.trackView(site.website.dealerId);
      return reply.status(200).send({
        data: {
          dealer: site.dealer,
          website: site.website,
        },
      });
    },
  );

  /**
   * GET /public/dealer-website/by-host/:host
   * Resolves by custom domain. `host` is the bare hostname from the
   * Host header (e.g. `www.mountainviewauto.com`).
   */
  app.get(
    "/by-host/:host",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { host: string };
      const site = await dealerWebsiteService.resolveByCustomDomain(params.host);
      if (!site || !site.website.isPublished) {
        throw new NotFoundError(`No site for host '${params.host}'`);
      }
      void dealerWebsiteService.trackView(site.website.dealerId);
      return reply.status(200).send({
        data: {
          dealer: site.dealer,
          website: site.website,
        },
      });
    },
  );

  /**
   * POST /public/dealer-website/:subdomain/lead
   * Public lead-capture form. Creates a Lead with source='website_form'.
   */
  app.post(
    "/:subdomain/lead",
    { preHandler: [validateBody(PublicLeadBodySchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { subdomain: string };
      const body = request.body as {
        subdomain: string;
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
        message?: string;
        vehicleStockNumber?: string;
        vehicleId?: string;
        sourceMeta?: Record<string, string | undefined>;
      };
      // Subdomain in URL must match the body to prevent a form on
      // site A from posting into site B's lead stream.
      if (params.subdomain !== body.subdomain) {
        throw new NotFoundError("Subdomain mismatch");
      }
      const result = await dealerWebsiteService.createPublicLead({
        ...body,
        sourceMeta: {
          ...(body.sourceMeta ?? {}),
          referrer: request.headers.referer ?? undefined,
          page: (body.sourceMeta?.page as string | undefined) ?? undefined,
        },
      });
      return reply.status(201).send({ data: result });
    },
  );

  /**
   * POST /public/dealer-website/:subdomain/finance-application
   * Public finance application form. Creates a Lead + Customer.
   */
  app.post(
    "/:subdomain/finance-application",
    { preHandler: [validateBody(FinanceApplicationBodySchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { subdomain: string };
      const body = request.body as {
        subdomain: string;
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
        message?: string;
        vehicleStockNumber?: string;
        vehicleId?: string;
        dob?: string;
        ssnLast4?: string;
        address?: Record<string, string | undefined>;
        employmentStatus?: string;
        monthlyIncome?: number;
        downPayment?: number;
        consentCreditCheck?: boolean;
        sourceMeta?: Record<string, string | undefined>;
      };
      if (params.subdomain !== body.subdomain) {
        throw new NotFoundError("Subdomain mismatch");
      }
      const result = await dealerWebsiteService.createFinanceApplication({
        ...body,
        sourceMeta: {
          ...(body.sourceMeta ?? {}),
          referrer: request.headers.referer ?? undefined,
        },
      });
      return reply.status(201).send({ data: result });
    },
  );
}
