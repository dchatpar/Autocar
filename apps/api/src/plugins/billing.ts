/**
 * Billing plugin — registers the Stripe webhook route under
 * /webhooks/stripe with raw-body capture enabled.
 *
 * The `installRawBodyCapture` plugin (registered in `app.ts`) sets
 * `request.rawBody` for all JSON content-type requests. The webhook
 * handler reads that to verify the HMAC SHA-256 signature.
 *
 * This plugin is intentionally minimal — it just registers the route
 * group. Stripe SDK init is lazy (via `getStripeClient()` in the
 * integration module) so this plugin has no startup cost.
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { stripeWebhookRoutes } from "../routes/webhooks/stripe.js";

const billingPlugin = fp(
  async (app: FastifyInstance): Promise<void> => {
    // The /webhooks/* prefix is already registered for Meta + WhatsApp.
    // We register /webhooks/stripe under the same parent so all
    // webhooks live in one place. The route is public (no auth) and
    // bypasses the tenant plugin.
    await app.register(
      async (instance: FastifyInstance): Promise<void> => {
        await stripeWebhookRoutes(instance);
      },
      { prefix: "/stripe" },
    );
  },
  { name: "billing", dependencies: ["error", "auth", "tenant"] },
);

export default billingPlugin;
