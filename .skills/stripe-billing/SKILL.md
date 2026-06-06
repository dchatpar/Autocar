# Stripe Subscription Billing Skill

Build subscription, metered billing, and one-time payments for DealerOS.

## When to use this skill

When building features that need:
- Subscription billing (Starter $499, Growth $999, Pro $1,499, Enterprise $2,499)
- Per-dealer Stripe customer + subscription
- 14-day free trial
- Plan upgrade/downgrade with prorated billing
- Per-dealer usage metering (leads, SMS, emails)
- Failed payment handling + dunning
- Stripe Customer Portal for self-service
- Webhook handling for subscription state changes

## Stripe Node SDK

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
  appInfo: { name: 'DealerOS', version: '1.0.0' }
});

// Create customer
const customer = await stripe.customers.create({
  email: dealer.billingEmail,
  name: dealer.name,
  metadata: { dealerId: dealer.id }
});

// Create subscription with trial
const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: STRIPE_PRICE_IDS[plan] }],
  trial_period_days: 14,
  payment_behavior: 'default_incomplete',
  payment_settings: { save_default_payment_method: 'on_subscription' },
  expand: ['latest_invoice.payment_intent']
});

// Upgrade plan with proration
await stripe.subscriptions.update(subscriptionId, {
  items: [{
    id: subscription.items.data[0].id,
    price: STRIPE_PRICE_IDS[newPlan]
  }],
  proration_behavior: 'always_invoice'
});

// Cancel at period end
await stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: true
});
```

## Webhook Handler

```typescript
// IMPORTANT: Use raw body for signature verification
app.post('/webhooks/stripe', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed`);
  }

  switch (event.type) {
    case 'customer.subscription.created':
      await handleSubscriptionCreated(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionCancelled(event.data.object);
      break;
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
    case 'customer.subscription.trial_will_end':
      // Send reminder 3 days before trial ends
      await sendTrialEndingEmail(event.data.object);
      break;
  }
  res.status(200).send();
});
```

## Database Tables

```prisma
model Subscription {
  id                    String   @id @default(cuid())
  dealerId              String   @unique
  dealer                Dealer   @relation(fields: [dealerId], references: [id], onDelete: Cascade)
  stripeCustomerId      String
  stripeSubscriptionId  String   @unique
  stripePriceId         String
  plan                  SubscriptionPlan
  status                SubscriptionStatus
  currentPeriodStart    DateTime
  currentPeriodEnd      DateTime
  trialStart            DateTime?
  trialEnd              DateTime?
  cancelAtPeriodEnd     Boolean  @default(false)
  cancelledAt          DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

enum SubscriptionPlan { STARTER, GROWTH, PRO, ENTERPRISE }
enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
  INCOMPLETE
  INCOMPLETE_EXPIRED
}

model InvoiceStripe {
  id              String   @id @default(cuid())
  dealerId        String
  stripeInvoiceId String   @unique
  amount          Decimal  @db.Decimal(10,2)
  currency        String   @default("usd")
  status          String
  pdfUrl          String?
  paidAt          DateTime?
  createdAt       DateTime @default(now())

  dealer Dealer @relation(fields: [dealerId], references: [id], onDelete: Cascade)
  @@index([dealerId])
  @@map("stripe_invoices")
}

model UsageRecord {
  id        String   @id @default(cuid())
  dealerId  String
  metric    String   // 'leads' | 'sms_sent' | 'emails_sent' | 'ai_tokens'
  quantity  Int
  recordedAt DateTime @default(now())
  metadata  Json?

  dealer Dealer @relation(fields: [dealerId], references: [id], onDelete: Cascade)
  @@index([dealerId, metric, recordedAt])
  @@map("usage_records")
}
```

## API Routes

- POST   /billing/create-checkout-session (returns Stripe Checkout URL)
- POST   /billing/create-portal-session (returns Customer Portal URL)
- GET    /billing/subscription (current dealer's subscription)
- POST   /billing/subscription/upgrade (new plan)
- POST   /billing/subscription/cancel
- GET    /billing/invoices (history)
- GET    /billing/usage (current month usage by metric)
- POST   /webhooks/stripe (Stripe → us)

## Plan Limits (enforce in services)

| Plan | Users | Leads/mo | SMS/mo | Emails/mo | AI tokens/mo |
|---|---|---|---|---|---|
| Starter | 3 | 200 | 200 | 500 | 10K |
| Growth | 10 | 1000 | 2000 | 5000 | 100K |
| Pro | unlimited | 10000 | 10000 | 50000 | 1M |
| Enterprise | unlimited | unlimited | unlimited | unlimited | custom |

Check `Subscription.plan` in service layer, throw 402 if exceeded.

## Pricing Page (Public)

- /pricing (public, before login)
- 4 tier comparison table
- Feature matrix (Starter / Growth / Pro / Enterprise)
- FAQ section
- "Start 14-day free trial" button → Stripe Checkout

## Billing Dashboard

- /settings/billing
- Current plan card (with usage meters)
- Plan comparison (highlight current)
- Upgrade/downgrade buttons
- Invoice history table
- Payment method (last 4 of card)
- "Manage in Stripe Portal" button

## Reference

- https://stripe.com/docs/billing
- https://stripe.com/docs/billing/subscriptions/overview
- https://stripe.com/docs/customer-portal
