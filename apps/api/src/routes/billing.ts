/**
 * Billing routes — /api/billing/*
 *
 * Endpoints:
 *   POST /billing/create-checkout-session   (auth)  — returns Stripe Checkout URL
 *   POST /billing/create-portal-session     (auth)  — returns Customer Portal URL
 *   GET  /billing/subscription              (auth)  — current dealer's subscription
 *   POST /billing/subscription/upgrade      (auth)  — change plan with proration
 *   POST /billing/subscription/cancel       (auth)  — schedule cancellation
 *   POST /billing/subscription/resume       (auth)  — undo scheduled cancellation
 *   GET  /billing/invoices                  (auth)  — invoice history
 *   GET  /billing/usage                     (auth)  — current month usage by metric
 *
 * Multi-tenant: every handler reads `request.tenant.dealerId` and
 * passes it explicitly to the service layer. The Subscription table
 * has a unique constraint on dealerId, so duplicate rows are
 * impossible by design.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";
import {
  CreateCheckoutBodySchema,
  CreatePortalBodySchema,
  ListInvoicesQuerySchema,
  UpgradeBodySchema,
} from "../schemas/billing.schema.js";
import { validateBody, validateQuery } from "../utils/validate.js";
import { billingService } from "../services/billing.service.js";
import { usageMeter } from "../services/usage-meter.service.js";
import { getPlanLimit, resolveDealerPlan } from "../services/plan-limits.service.js";
import { prisma } from "../utils/prisma.js";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

const APP_ORIGIN = (process.env.APP_ORIGIN ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

function defaultSuccessUrl(plan: string): string {
  return `${APP_ORIGIN}/billing/checkout-success?plan=${encodeURIComponent(plan)}`;
}

function defaultCancelUrl(): string {
  return `${APP_ORIGIN}/billing/checkout-cancel`;
}

function defaultPortalReturnUrl(): string {
  return `${APP_ORIGIN}/settings/billing`;
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /billing/create-checkout-session
   * Returns a hosted Stripe Checkout URL the browser should navigate to.
   */
  app.post(
    "/create-checkout-session",
    {
      preHandler: [app.authenticate, validateBody(CreateCheckoutBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as {
        plan: "STARTER" | "GROWTH" | "PRO" | "ENTERPRISE";
        successUrl?: string;
        cancelUrl?: string;
      };
      const result = await billingService.createCheckoutSession({
        dealerId: payload.dealerId,
        plan: body.plan,
        successUrl: body.successUrl ?? defaultSuccessUrl(body.plan),
        cancelUrl: body.cancelUrl ?? defaultCancelUrl(),
      });
      return reply.status(200).send({ data: result });
    },
  );

  /**
   * POST /billing/create-portal-session
   * Returns a hosted Customer Portal URL.
   */
  app.post(
    "/create-portal-session",
    {
      preHandler: [app.authenticate, validateBody(CreatePortalBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as { returnUrl?: string };
      const result = await billingService.createPortalSession({
        dealerId: payload.dealerId,
        returnUrl: body.returnUrl ?? defaultPortalReturnUrl(),
      });
      return reply.status(200).send({ data: result });
    },
  );

  /**
   * GET /billing/subscription
   * Returns the dealer's current subscription (or null if none).
   * Includes the plan limit row so the dashboard can render features.
   */
  app.get(
    "/subscription",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const dealer = await prisma.dealer.findUnique({
        where: { id: payload.dealerId },
      });
      if (!dealer) {
        return reply.status(200).send({ data: null });
      }
      const sub = await billingService.getSubscription(payload.dealerId);
      const plan = resolveDealerPlan({
        subscriptionPlan: sub?.plan ?? null,
        dealerPlan: dealer.plan,
      });
      const limits = getPlanLimit(plan);
      return reply.status(200).send({
        data: sub
          ? {
              ...sub,
              planLimits: {
                label: limits.label,
                price: limits.price,
                tagline: limits.tagline,
                features: limits.features,
              },
            }
          : null,
      });
    },
  );

  /**
   * POST /billing/subscription/upgrade
   * Switch to a new plan with prorated billing.
   */
  app.post(
    "/subscription/upgrade",
    {
      preHandler: [app.authenticate, validateBody(UpgradeBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as { plan: "STARTER" | "GROWTH" | "PRO" | "ENTERPRISE" };
      const result = await billingService.upgradePlan({
        dealerId: payload.dealerId,
        newPlan: body.plan,
      });
      return reply.status(200).send({
        data: {
          subscription: result.subscription,
          changed: result.changed,
          direction: result.direction,
        },
      });
    },
  );

  /**
   * POST /billing/subscription/cancel
   * Schedule cancellation at the end of the current period.
   */
  app.post(
    "/subscription/cancel",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const sub = await billingService.cancelAtPeriodEnd(payload.dealerId);
      return reply.status(200).send({ data: sub });
    },
  );

  /**
   * POST /billing/subscription/resume
   * Reverse a previously scheduled cancellation.
   */
  app.post(
    "/subscription/resume",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const sub = await billingService.resumeSubscription(payload.dealerId);
      return reply.status(200).send({ data: sub });
    },
  );

  /**
   * GET /billing/invoices?limit=
   * Returns the dealer's invoice history, newest first.
   */
  app.get(
    "/invoices",
    {
      preHandler: [app.authenticate, validateQuery(ListInvoicesQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const query = (request as { validatedQuery?: { limit?: number } })
        .validatedQuery ?? { limit: 24 };
      const items = await billingService.listInvoices(
        payload.dealerId,
        query.limit ?? 24,
      );
      return reply.status(200).send({
        data: items.map((inv) => ({
          id: inv.id,
          stripeInvoiceId: inv.stripeInvoiceId,
          amount: Number(inv.amount),
          currency: inv.currency,
          status: inv.status,
          pdfUrl: inv.pdfUrl,
          paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
          createdAt: inv.createdAt.toISOString(),
        })),
      });
    },
  );

  /**
   * GET /billing/usage
   * Returns the current month usage + caps for the dashboard meters.
   */
  app.get(
    "/usage",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const dealer = await prisma.dealer.findUnique({
        where: { id: payload.dealerId },
      });
      if (!dealer) {
        return reply.status(200).send({ data: null });
      }
      const sub = await billingService.getSubscription(payload.dealerId);
      const plan = resolveDealerPlan({
        subscriptionPlan: sub?.plan ?? null,
        dealerPlan: dealer.plan,
      });
      const usage = await usageMeter.getCurrent(payload.dealerId, plan);
      return reply.status(200).send({ data: usage });
    },
  );
}

// Re-export the service for tests / external use.
export { billingService } from "../services/billing.service.js";
