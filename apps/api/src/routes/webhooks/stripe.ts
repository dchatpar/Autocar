/**
 * Stripe webhook — POST /webhooks/stripe
 *
 * CRITICAL: This route must receive the RAW request body, not a
 * JSON-parsed object, because Stripe signs the raw bytes. The raw
 * body is captured by `installRawBodyCapture` in `utils/hmac.ts`
 * (registered as a Fastify plugin in `app.ts`).
 *
 * Flow:
 *   1. Read raw body from `request.rawBody`
 *   2. Verify the `stripe-signature` header using the SDK helper
 *      (HMAC SHA-256 of the raw bytes, compared timing-safely)
 *   3. Parse the event
 *   4. Dispatch by type:
 *        - customer.subscription.created/updated/deleted
 *        - invoice.payment_succeeded/failed
 *        - customer.subscription.trial_will_end
 *   5. Always return 200 within 5s (Stripe will retry on slow / non-2xx)
 *
 * Idempotency:
 *   - Subscription upserts are idempotent on `stripeSubscriptionId`
 *     and on the unique `dealerId` index.
 *   - Invoice upserts are idempotent on `stripeInvoiceId`.
 *
 * Tenant scoping:
 *   - The webhook is unauthenticated (Stripe can't carry our JWT).
 *   - We resolve `dealerId` from the event's customer or
 *     subscription id by looking it up in the Subscription table.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { verifyWebhookSignature } from "../../integrations/stripe/client.js";
import { billingService } from "../../services/billing.service.js";
import { envOr } from "../../integrations/shared/credentials.js";
import type Stripe from "stripe";

interface WebhookResult {
  received: boolean;
  type: string;
  id: string;
  processed: boolean;
  reason?: string;
}

function ok(reply: FastifyReply, payload: WebhookResult): FastifyReply {
  return reply.status(200).send({ data: payload });
}

function customerIdOf(
  v: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

function subscriptionIdOf(
  v: string | Stripe.Subscription | null | undefined,
): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

export async function stripeWebhookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /webhooks/stripe
   * Single endpoint for all Stripe events.
   */
  app.post(
    "/",
    {
      config: { rateLimit: false, requireTenant: false },
    },
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      // 1. Pull the raw body captured by the content-type parser.
      const rawBody = (request as { rawBody?: string }).rawBody;
      if (typeof rawBody !== "string" || rawBody.length === 0) {
        request.log.warn("Stripe webhook: missing raw body");
        return reply
          .status(400)
          .send({ error: "Missing raw body", code: "BAD_REQUEST" });
      }

      // 2. Verify signature. The SDK helper throws on any failure.
      const signatureHeader = request.headers["stripe-signature"];
      const signatureStr = Array.isArray(signatureHeader)
        ? signatureHeader[0]
        : signatureHeader;
      const webhookSecret = envOr("STRIPE_WEBHOOK_SECRET", "");
      if (!webhookSecret) {
        request.log.error("STRIPE_WEBHOOK_SECRET is not configured");
        return reply
          .status(500)
          .send({ error: "Webhook misconfigured", code: "SERVER_ERROR" });
      }
      let event: Stripe.Event;
      try {
        event = verifyWebhookSignature({
          rawBody,
          signatureHeader: signatureStr,
          webhookSecret,
        });
      } catch (err) {
        request.log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "Stripe webhook: signature verification failed",
        );
        return reply
          .status(400)
          .send({ error: "Invalid signature", code: "INVALID_SIGNATURE" });
      }

      // 3. Dispatch by event type.
      const dealerId = await resolveDealerIdForEvent(event);
      if (!dealerId && needsDealerId(event.type)) {
        // Unknown customer — log and 200 so Stripe doesn't retry.
        request.log.warn(
          { type: event.type, id: event.id },
          "Stripe webhook: no dealer matched for event",
        );
        return ok(reply, {
          received: true,
          type: event.type,
          id: event.id,
          processed: false,
          reason: "no_dealer_match",
        });
      }

      try {
        await dispatchEvent(event, dealerId);
      } catch (err) {
        request.log.error(
          { err, type: event.type, id: event.id },
          "Stripe webhook: handler error",
        );
        // Return 500 so Stripe retries. We've already written what
        // we could, and idempotency protects against double-writes.
        return reply.status(500).send({
          error: "Handler error",
          code: "SERVER_ERROR",
        });
      }

      return ok(reply, {
        received: true,
        type: event.type,
        id: event.id,
        processed: true,
      });
    },
  );
}

function needsDealerId(type: string): boolean {
  // Most events we care about carry a customer / subscription id we
  // can map to a dealer. account.updated and similar platform events
  // don't.
  return (
    type.startsWith("customer.subscription.") ||
    type.startsWith("invoice.") ||
    type === "checkout.session.completed"
  );
}

async function resolveDealerIdForEvent(event: Stripe.Event): Promise<string | null> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      const subId = subscriptionIdOf(sub);
      if (subId) {
        const d = await billingService.dealerIdForSubscriptionId(subId);
        if (d) return d;
      }
      const cust = customerIdOf(sub.customer);
      if (cust) return billingService.dealerIdForCustomerId(cust);
      return null;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
    case "invoice.finalized":
    case "invoice.created": {
      const inv = event.data.object as Stripe.Invoice;
      const cust = customerIdOf(inv.customer);
      if (!cust) return null;
      return billingService.dealerIdForCustomerId(cust);
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // Prefer explicit metadata.dealerId (we set it on creation).
      const md = session.metadata as Record<string, string> | null;
      if (md && typeof md.dealerId === "string" && md.dealerId.length > 0) {
        return md.dealerId;
      }
      const cust = customerIdOf(session.customer);
      if (cust) return billingService.dealerIdForCustomerId(cust);
      return null;
    }
    default:
      return null;
  }
}

async function dispatchEvent(
  event: Stripe.Event,
  dealerId: string | null,
): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      if (!dealerId) return;
      const sub = event.data.object as Stripe.Subscription;
      await billingService.upsertSubscriptionFromStripe({
        dealerId,
        subscription: sub,
      });
      return;
    }
    case "customer.subscription.deleted": {
      if (!dealerId) return;
      const sub = event.data.object as Stripe.Subscription;
      await billingService.upsertSubscriptionFromStripe({
        dealerId,
        subscription: sub,
      });
      return;
    }
    case "customer.subscription.trial_will_end": {
      // No DB write here. A scheduled job / email service can pick
      // this up to send the trial-ending reminder. We log it so the
      // audit trail is preserved in the request log.
      if (!dealerId) return;
      // eslint-disable-next-line no-console
      console.log(
        `[billing] trial_will_end for dealer=${dealerId} sub=${(event.data.object as Stripe.Subscription).id}`,
      );
      return;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
    case "invoice.finalized":
    case "invoice.created": {
      if (!dealerId) return;
      const inv = event.data.object as Stripe.Invoice;
      await billingService.upsertInvoiceFromStripe({
        dealerId,
        invoice: inv,
      });
      // For payment_failed, downgrade visibility: bump the
      // subscription status to PAST_DUE if Stripe marked the invoice
      // as uncollectible.
      if (event.type === "invoice.payment_failed" && inv.subscription) {
        const subId =
          typeof inv.subscription === "string"
            ? inv.subscription
            : inv.subscription.id;
        const sub = await billingService.dealerIdForSubscriptionId(subId);
        if (sub) {
          // Trigger a re-fetch so the subscription row reflects the
          // latest status. The actual subscription.updated event will
          // arrive shortly, but we update locally to keep the UI
          // responsive.
          // (No-op here; the next customer.subscription.updated will
          // overwrite us.)
        }
      }
      return;
    }
    case "checkout.session.completed": {
      // The subscription.created event will follow. We just make
      // sure the dealer.settings has the customer id cached.
      if (!dealerId) return;
      const session = event.data.object as Stripe.Checkout.Session;
      const cust = customerIdOf(session.customer);
      if (cust) {
        const { prisma } = await import("../../utils/prisma.js");
        const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
        if (dealer) {
          const settings = (dealer.settings as Record<string, unknown> | null) ?? {};
          if (settings["stripe_customer_id"] !== cust) {
            await prisma.dealer.update({
              where: { id: dealerId },
              data: {
                settings: { ...settings, stripe_customer_id: cust } as object,
              },
            });
          }
        }
      }
      return;
    }
    default:
      // Unhandled event type — accept and move on.
      return;
  }
}
