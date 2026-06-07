/**
 * Stripe SDK singleton.
 *
 * Initialized lazily so import-time has no side effects. The first
 * `getStripeClient()` call constructs the SDK; subsequent calls return
 * the same instance. The webhook helpers (`verifyWebhookSignature`,
 * `constructWebhookEvent`) are exposed separately so they can be
 * called without a full client (e.g. in cold-start scenarios).
 *
 * Required env:
 *   - STRIPE_SECRET_KEY        (e.g. sk_test_...)
 *   - STRIPE_WEBHOOK_SECRET    (whsec_...)
 *   - STRIPE_PRICE_STARTER     (price_...)
 *   - STRIPE_PRICE_GROWTH      (price_...)
 *   - STRIPE_PRICE_PRO         (price_...)
 *   - STRIPE_PRICE_ENTERPRISE  (price_...)
 *
 * In dev / CI we allow a "fake" key to be set so the rest of the
 * service code can be exercised without contacting Stripe. The
 * caller is responsible for guarding against that in prod.
 */

import Stripe from "stripe";
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";

import { envOr } from "../shared/credentials.js";

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-02-24.acacia";

let _client: Stripe | null = null;

/**
 * Return the configured Stripe SDK instance. The instance is
 * cached on first call.
 */
export function getStripeClient(): Stripe {
  if (_client) return _client;

  const secretKey = envOr("STRIPE_SECRET_KEY", "");
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured — set it in the API env to use billing routes.",
    );
  }
  _client = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: { name: "DealerOS", version: "1.0.0" },
    typescript: true,
  });
  return _client;
}

/**
 * Reset the cached client. Test-only — useful for env overrides
 * between specs.
 */
export function _resetStripeClient(): void {
  _client = null;
}

/**
 * True if Stripe is configured. Use this to short-circuit routes in
 * dev (e.g. return a stub checkout URL) without making real network
 * calls.
 */
export function isStripeConfigured(): boolean {
  return envOr("STRIPE_SECRET_KEY", "").length > 0;
}

/**
 * Map an internal SubscriptionPlan to the corresponding Stripe price
 * ID. Throws ServerError-equivalent Error if the env var is missing.
 */
export function priceIdForPlan(plan: SubscriptionPlan): string {
  const envKey = `STRIPE_PRICE_${plan}`;
  const id = envOr(envKey, "");
  if (!id) {
    throw new Error(
      `${envKey} is not configured — set it to the price_… id for the ${plan} plan.`,
    );
  }
  return id;
}

/**
 * Inverse: resolve a Stripe price ID to the matching plan enum. Used
 * on webhooks to keep the Subscription.plan column in sync.
 */
export function planForPriceId(priceId: string): SubscriptionPlan | null {
  const all: ReadonlyArray<SubscriptionPlan> = [
    "STARTER",
    "GROWTH",
    "PRO",
    "ENTERPRISE",
  ];
  for (const p of all) {
    if (priceId === envOr(`STRIPE_PRICE_${p}`, "")) return p;
  }
  return null;
}

/**
 * Map a Stripe subscription status string to our enum.
 */
export function mapStripeStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "incomplete":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "INCOMPLETE_EXPIRED";
    case "paused":
    default:
      // We don't model "paused" separately — treat as past-due so the
      // dashboard surfaces an actionable warning.
      return "PAST_DUE";
  }
}

/**
 * Verify a Stripe webhook signature using the raw request body.
 * Throws Error on any verification failure.
 */
export function verifyWebhookSignature(input: {
  rawBody: string | Buffer;
  signatureHeader: string | undefined;
  webhookSecret: string;
}): Stripe.Event {
  const stripe = getStripeClient();
  if (!input.signatureHeader) {
    throw new Error("missing_signature_header");
  }
  if (!input.webhookSecret) {
    throw new Error("missing_webhook_secret");
  }
  try {
    return stripe.webhooks.constructEvent(
      input.rawBody,
      input.signatureHeader,
      input.webhookSecret,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`webhook_signature_verification_failed: ${msg}`);
  }
}

/**
 * Public exports for webhook handlers. The Stripe class is exported
 * by name for `instanceof` checks; the type is re-exported as a
 * type-only binding.
 */
export { Stripe };
export type { Stripe as StripeTypes };

