/**
 * Billing service — Stripe subscription lifecycle.
 *
 * Responsibilities:
 *   - Resolve a dealer's Stripe customer (lazily create on first use)
 *   - Create a Stripe Checkout Session for new subscriptions
 *   - Generate a Customer Portal link for self-service
 *   - Upgrade / downgrade with prorated billing
 *   - Schedule cancellation at period end
 *   - Look up current subscription + invoice history
 *
 * Multi-tenant: every read/write is scoped to a dealerId. There is no
 * cross-tenant query.
 *
 * Failure modes:
 *   - All Stripe calls are wrapped in try/catch and re-thrown as
 *     ServerError with a friendly message — we never leak Stripe
 *     error details to the client.
 */

import type {
  Dealer,
  InvoiceStripe as PrismaInvoice,
  Subscription as PrismaSubscription,
  SubscriptionPlan,
} from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "../utils/prisma.js";
import {
  getStripeClient,
  isStripeConfigured,
  mapStripeStatus,
  planForPriceId,
  priceIdForPlan,
} from "../integrations/stripe/client.js";
import {
  ConflictError,
  NotFoundError,
  ServerError,
  ValidationError,
} from "../utils/errors.js";

const PLAN_RANK: Readonly<Record<SubscriptionPlan, number>> = {
  STARTER: 1,
  GROWTH: 2,
  PRO: 3,
  ENTERPRISE: 4,
};

/**
 * Find a dealer by id. Throws NotFoundError if missing.
 */
async function getDealer(dealerId: string): Promise<Dealer> {
  const d = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!d) throw new NotFoundError("Dealer not found");
  return d;
}

/**
 * Read the cached Stripe customer id off Dealer.settings.
 */
function readCustomerIdFromSettings(d: Dealer): string | null {
  const s = d.settings as Record<string, unknown> | null;
  if (!s) return null;
  const id = s["stripe_customer_id"];
  return typeof id === "string" && id.length > 0 ? id : null;
}

function writeCustomerIdToSettings(
  d: Dealer,
  customerId: string,
): Record<string, unknown> {
  const s = (d.settings as Record<string, unknown> | null) ?? {};
  return { ...s, stripe_customer_id: customerId };
}

export const billingService = {
  /**
   * Look up the dealer's current subscription row (or null).
   */
  async getSubscription(dealerId: string): Promise<PrismaSubscription | null> {
    return prisma.subscription.findUnique({ where: { dealerId } });
  },

  /**
   * Lazily create the dealer's Stripe customer and cache the id.
   */
  async ensureStripeCustomer(dealerId: string): Promise<string> {
    if (!isStripeConfigured()) {
      throw new ServerError("Stripe is not configured on this environment");
    }
    const dealer = await getDealer(dealerId);
    const cached = readCustomerIdFromSettings(dealer);
    if (cached) return cached;

    const stripe = getStripeClient();
    const customer = await stripe.customers.create({
      name: dealer.name,
      metadata: { dealerId: dealer.id, subdomain: dealer.subdomain },
    });

    await prisma.dealer.update({
      where: { id: dealer.id },
      data: { settings: writeCustomerIdToSettings(dealer, customer.id) as object },
    });
    return customer.id;
  },

  /**
   * Create a hosted Stripe Checkout session for a new subscription.
   */
  async createCheckoutSession(input: {
    dealerId: string;
    plan: SubscriptionPlan;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    if (!isStripeConfigured()) {
      throw new ServerError("Stripe is not configured on this environment");
    }
    const customerId = await this.ensureStripeCustomer(input.dealerId);
    const priceId = priceIdForPlan(input.plan);

    const stripe = getStripeClient();
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        subscription_data: {
          trial_period_days: 14,
          metadata: {
            dealerId: input.dealerId,
            plan: input.plan,
          },
        },
        allow_promotion_codes: true,
        billing_address_collection: "auto",
        metadata: { dealerId: input.dealerId, plan: input.plan },
      });
      if (!session.url) {
        throw new ServerError("Stripe did not return a checkout URL");
      }
      return { url: session.url, sessionId: session.id };
    } catch (err) {
      throw new ServerError(
        err instanceof Error ? err.message : "Failed to create checkout session",
      );
    }
  },

  /**
   * Create a hosted Customer Portal session.
   */
  async createPortalSession(input: {
    dealerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    if (!isStripeConfigured()) {
      throw new ServerError("Stripe is not configured on this environment");
    }
    const customerId = await this.ensureStripeCustomer(input.dealerId);

    const stripe = getStripeClient();
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: input.returnUrl,
      });
      return { url: session.url };
    } catch (err) {
      throw new ServerError(
        err instanceof Error ? err.message : "Failed to create portal session",
      );
    }
  },

  /**
   * Switch the dealer's subscription to a new plan, prorated.
   */
  async upgradePlan(input: {
    dealerId: string;
    newPlan: SubscriptionPlan;
  }): Promise<{
    subscription: PrismaSubscription;
    changed: boolean;
    direction: "upgrade" | "downgrade" | "lateral";
  }> {
    if (!isStripeConfigured()) {
      throw new ServerError("Stripe is not configured on this environment");
    }
    const existing = await prisma.subscription.findUnique({
      where: { dealerId: input.dealerId },
    });
    if (!existing) {
      throw new NotFoundError(
        "No active subscription — create a checkout session first",
      );
    }
    if (
      existing.status === "CANCELED" ||
      existing.status === "INCOMPLETE_EXPIRED"
    ) {
      throw new ConflictError("Subscription is no longer active");
    }
    const currentRank = PLAN_RANK[existing.plan];
    const newRank = PLAN_RANK[input.newPlan];
    if (newRank === currentRank) {
      return { subscription: existing, changed: false, direction: "lateral" };
    }
    const direction: "upgrade" | "downgrade" =
      newRank > currentRank ? "upgrade" : "downgrade";

    const stripe = getStripeClient();
    const newPriceId = priceIdForPlan(input.newPlan);

    try {
      const live = await stripe.subscriptions.retrieve(
        existing.stripeSubscriptionId,
      );
      const item = live.items.data[0];
      if (!item) throw new ServerError("Stripe subscription has no items");
      await stripe.subscriptions.update(existing.stripeSubscriptionId, {
        items: [{ id: item.id, price: newPriceId }],
        proration_behavior: "always_invoice",
        metadata: { dealerId: input.dealerId, plan: input.newPlan },
      });
    } catch (err) {
      throw new ServerError(
        err instanceof Error ? err.message : "Failed to update subscription",
      );
    }

    const updated = await prisma.subscription.update({
      where: { id: existing.id },
      data: { plan: input.newPlan, stripePriceId: newPriceId },
    });
    await prisma.dealer.update({
      where: { id: input.dealerId },
      data: { plan: input.newPlan },
    });
    return { subscription: updated, changed: true, direction };
  },

  /**
   * Schedule cancellation at the end of the current period.
   */
  async cancelAtPeriodEnd(dealerId: string): Promise<PrismaSubscription> {
    if (!isStripeConfigured()) {
      throw new ServerError("Stripe is not configured on this environment");
    }
    const existing = await prisma.subscription.findUnique({
      where: { dealerId },
    });
    if (!existing) throw new NotFoundError("No active subscription to cancel");
    if (existing.cancelAtPeriodEnd) return existing;
    if (existing.status === "CANCELED") return existing;

    const stripe = getStripeClient();
    try {
      await stripe.subscriptions.update(existing.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (err) {
      throw new ServerError(
        err instanceof Error ? err.message : "Failed to cancel subscription",
      );
    }
    return prisma.subscription.update({
      where: { id: existing.id },
      data: { cancelAtPeriodEnd: true },
    });
  },

  /**
   * Reverse a previously scheduled cancellation.
   */
  async resumeSubscription(dealerId: string): Promise<PrismaSubscription> {
    if (!isStripeConfigured()) {
      throw new ServerError("Stripe is not configured on this environment");
    }
    const existing = await prisma.subscription.findUnique({
      where: { dealerId },
    });
    if (!existing) throw new NotFoundError("No subscription to resume");
    if (!existing.cancelAtPeriodEnd) return existing;

    const stripe = getStripeClient();
    try {
      await stripe.subscriptions.update(existing.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
    } catch (err) {
      throw new ServerError(
        err instanceof Error ? err.message : "Failed to resume subscription",
      );
    }
    return prisma.subscription.update({
      where: { id: existing.id },
      data: { cancelAtPeriodEnd: false, cancelledAt: null },
    });
  },

  /**
   * List invoices for the dealer, newest first.
   */
  async listInvoices(
    dealerId: string,
    limit: number = 24,
  ): Promise<PrismaInvoice[]> {
    return prisma.invoiceStripe.findMany({
      where: { dealerId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });
  },

  /**
   * Read a single invoice (tenant-scoped).
   */
  async getInvoice(
    dealerId: string,
    invoiceId: string,
  ): Promise<PrismaInvoice> {
    const inv = await prisma.invoiceStripe.findFirst({
      where: { id: invoiceId, dealerId },
    });
    if (!inv) throw new NotFoundError("Invoice not found");
    return inv;
  },

  /**
   * Upsert a Subscription row from a Stripe subscription object.
   */
  async upsertSubscriptionFromStripe(input: {
    dealerId: string;
    subscription: Stripe.Subscription;
  }): Promise<PrismaSubscription> {
    const sub = input.subscription;
    const item = sub.items.data[0];
    if (!item) {
      throw new ServerError("Stripe subscription has no items");
    }
    const priceId = item.price.id;
    const plan = planForPriceId(priceId) ?? "STARTER";
    const status = mapStripeStatus(sub.status);

    const currentPeriodStart = new Date(
      (sub as unknown as { current_period_start: number }).current_period_start * 1000,
    );
    const currentPeriodEnd = new Date(
      (sub as unknown as { current_period_end: number }).current_period_end * 1000,
    );
    const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : null;
    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
    const cancelledAt = sub.canceled_at
      ? new Date(sub.canceled_at * 1000)
      : null;

    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer.id;

    const existing = await prisma.subscription.findUnique({
      where: { dealerId: input.dealerId },
    });

    let result: PrismaSubscription;
    if (existing) {
      result = await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          stripeSubscriptionId: sub.id,
          stripeCustomerId: customerId,
          stripePriceId: priceId,
          plan,
          status,
          currentPeriodStart,
          currentPeriodEnd,
          trialStart,
          trialEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          cancelledAt,
        },
      });
    } else {
      result = await prisma.subscription.create({
        data: {
          dealerId: input.dealerId,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: customerId,
          stripePriceId: priceId,
          plan,
          status,
          currentPeriodStart,
          currentPeriodEnd,
          trialStart,
          trialEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          cancelledAt,
        },
      });
    }

    await prisma.dealer.update({
      where: { id: input.dealerId },
      data: { plan },
    });
    return result;
  },

  /**
   * Upsert an InvoiceStripe row from a Stripe invoice. Idempotent on
   * stripeInvoiceId.
   */
  async upsertInvoiceFromStripe(input: {
    dealerId: string;
    invoice: Stripe.Invoice;
  }): Promise<PrismaInvoice> {
    const inv = input.invoice;
    const amount = (inv.amount_paid ?? inv.amount_due ?? 0) / 100;
    const customerId =
      typeof inv.customer === "string"
        ? inv.customer
        : inv.customer?.id ?? null;
    if (!customerId) {
      throw new ValidationError("Invoice missing customer id");
    }
    const dealer = await prisma.dealer.findUnique({
      where: { id: input.dealerId },
    });
    if (dealer) {
      const cached = readCustomerIdFromSettings(dealer);
      if (cached && cached !== customerId) {
        await prisma.dealer.update({
          where: { id: dealer.id },
          data: {
            settings: writeCustomerIdToSettings(dealer, customerId) as object,
          },
        });
      }
    }

    const paidAt =
      inv.status === "paid" && inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : null;

    const stripeInvoiceId = inv.id;
    if (!stripeInvoiceId) {
      throw new ValidationError("Invoice missing id");
    }

    return prisma.invoiceStripe.upsert({
      where: { stripeInvoiceId },
      create: {
        dealerId: input.dealerId,
        stripeInvoiceId,
        amount,
        currency: inv.currency ?? "usd",
        status: inv.status ?? "unknown",
        pdfUrl: inv.invoice_pdf ?? inv.hosted_invoice_url ?? null,
        paidAt,
      },
      update: {
        amount,
        currency: inv.currency ?? "usd",
        status: inv.status ?? "unknown",
        pdfUrl: inv.invoice_pdf ?? inv.hosted_invoice_url ?? null,
        paidAt,
      },
    });
  },

  /**
   * Resolve a dealer id from a Stripe customer id.
   */
  async dealerIdForCustomerId(customerId: string): Promise<string | null> {
    const dealer = await prisma.dealer.findFirst({
      where: {
        settings: {
          path: ["stripe_customer_id"],
          equals: customerId,
        },
      },
      select: { id: true },
    });
    if (dealer) return dealer.id;
    const sub = await prisma.subscription.findFirst({
      where: { stripeCustomerId: customerId },
      select: { dealerId: true },
    });
    return sub?.dealerId ?? null;
  },

  /**
   * Resolve a dealer id from a Stripe subscription id.
   */
  async dealerIdForSubscriptionId(
    subscriptionId: string,
  ): Promise<string | null> {
    const sub = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { dealerId: true },
    });
    return sub?.dealerId ?? null;
  },
};
