/**
 * Fastify app factory.
 *
 * Builds a fully-configured Fastify instance with all plugins and
 * routes registered. Used by both `server.ts` (production) and any
 * future integration tests.
 */

import Fastify, { type FastifyInstance } from "fastify";
import corsPlugin from "@fastify/cors";
import cookiePlugin from "@fastify/cookie";
import rateLimitPlugin from "@fastify/rate-limit";

import authPlugin from "./plugins/auth.js";
import tenantPlugin from "./plugins/tenant.js";
import errorPlugin from "./plugins/error.js";
import websocketPlugin from "./plugins/websocket.js";
import { notificationRoutes } from "./routes/notifications.js";
import { taskRoutes } from "./routes/tasks.js";
import { ticketRoutes } from "./routes/tickets.js";
import { aiAgentRoutes } from "./routes/ai-agents.js";
import { calendarRoutes } from "./routes/calendar.js";
import { statsBroadcastJob } from "./queues/stats-broadcast.queue.js";
import billingPlugin from "./plugins/billing.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { dealerRoutes } from "./routes/dealer.js";
import { signatureRoutes } from "./routes/signatures.js";
import { dealScopedRoutes } from "./routes/deals.js";
import { metaLeadsWebhookRoutes } from "./routes/webhooks/meta-leads.js";
import { whatsAppWebhookRoutes } from "./routes/webhooks/whatsapp.js";
import { docusignWebhookRoutes } from "./routes/webhooks/docusign.js";
import { installRawBodyCapture } from "./utils/hmac.js";
import { routingSettingsRoutes } from "./routes/routing-settings.js";
import { duplicateRoutes, leadDuplicateRoutes } from "./routes/duplicates.js";
import {
  dealerWebsiteRoutes,
  publicDealerWebsiteRoutes,
} from "./routes/dealer-website.js";
import { onLeadIngest } from "./hooks/on-lead-ingest.js";
import { onCustomerCreate } from "./hooks/on-customer-create.js";
import { leadScoreRoutes } from "./routes/lead-scores.js";
import { leadScoreQueue } from "./queues/lead-score.queue.js";
import { billingRoutes } from "./routes/billing.js";
import {
  activityLogAdminRoutes,
  activityLogRoutes,
  entityTrailRoutes,
} from "./routes/activity-logs.js";
import { activityPurgeJob } from "./queues/activity-purge.queue.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { campaignQueue } from "./queues/campaign.queue.js";
import { inventoryRoutes } from "./routes/inventory-lookup.js";
import { inventoryRoutes as inventoryFullRoutes } from "./routes/inventory.js";
import { vehiclesRoutes } from "./routes/vehicles.js";
import { pipelineRoutes } from "./routes/pipeline.js";
import { financeRoutes } from "./routes/finance.js";
import { tasksRoutes } from "./routes/tasks.js";
import { ticketsRoutes } from "./routes/tickets.js";
import { customerRoutes } from "./routes/customer-scan-dl.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { leadsRoutes } from "./routes/leads.js";
import { customersRoutes } from "./routes/customers.js";
import { appointmentsRoutes } from "./routes/appointments.js";
import { testDrivesRoutes } from "./routes/test-drives.js";
import { notesRoutes } from "./routes/notes.js";
import "./utils/redis.js"; // ensure Redis is initialized

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === "production"
        ? { level: "info" }
        : process.env.LOG_PRETTY === "true"
          ? { level: "debug", transport: { target: "pino-pretty" } }
          : { level: "debug" },
    bodyLimit: 1024 * 1024, // 1MB
    trustProxy: true,
  });

  // Plugins
  await app.register(errorPlugin);
  await app.register(installRawBodyCapture);

  await app.register(corsPlugin, {
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","),
    credentials: true,
  });

  await app.register(cookiePlugin, {
    secret: process.env.AUTH_JWT_SECRET ?? "dev-secret-change-me",
  });

  await app.register(rateLimitPlugin, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: Number(process.env.RATE_LIMIT_TIME_WINDOW ?? 60_000),
  });

  await app.register(authPlugin);
  await app.register(tenantPlugin);

  // WebSocket (Socket.IO + Redis adapter). Mounts on /ws; no-op if
  // the plugin is disabled (e.g. unit tests).
  if (process.env.WS_DISABLED !== "true") {
    await app.register(websocketPlugin);
  }
  await app.register(billingPlugin);

  // Healthcheck (public)
  app.get("/health", async () => {
    return { data: { status: "ok", timestamp: new Date().toISOString() } };
  });

  // Routes
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await authRoutes(instance);
    },
    { prefix: "/auth" },
  );

  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await userRoutes(instance);
    },
    { prefix: "/users" },
  );

  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await dealerRoutes(instance);
    },
    { prefix: "/dealer" },
  );

  // Webhook routes — public, HMAC-verified. Bypass tenant context.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await metaLeadsWebhookRoutes(instance);
    },
    { prefix: "/webhooks/meta" },
  );

  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await whatsAppWebhookRoutes(instance);
    },
    { prefix: "/webhooks" },
  );

  // DocuSign Connect webhook — HMAC-verified, no tenant context.
  // Mounted at /webhooks (same prefix as WhatsApp) so DocuSign
  // can POST to https://app.dealeros.com/webhooks/docusign.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await docusignWebhookRoutes(instance);
    },
    { prefix: "/webhooks" },
  );

  // E-signature envelope management — tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await signatureRoutes(instance);
    },
    { prefix: "/signatures" },
  );

  // Deal-scoped route surface (e.g. /deals/:id/signatures).
  // Kept thin — handlers delegate to the relevant service.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await dealScopedRoutes(instance);
    },
    { prefix: "/deals" },
  );

  // Lead routing settings (UI-facing). Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await routingSettingsRoutes(instance);
    },
    { prefix: "/routing" },
  );

  // Lead scoring — rules engine + history + distribution.
  // Mounted under /leads so the URL surface is RESTful
  // (POST /leads/:id/score, GET /leads/:id/score/history, ...).
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await leadScoreRoutes(instance);
    },
    { prefix: "/leads" },
  );

  // Start the score recompute worker. Idempotent + optional — if Redis
  // is missing, it returns null and the routes fall back to direct
  // recompute via the queue's enqueue helper.
  if (leadScoreQueue.isEnabled()) {
    leadScoreQueue.startScoreWorker();
    app.addHook("onClose", async (): Promise<void> => {
      await leadScoreQueue.stopScoreWorker();
    });
  }

  // Activity logs (audit trail). Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await activityLogRoutes(instance);
      await activityLogAdminRoutes(instance);
    },
    { prefix: "/activity-logs" },
  );

  // Entity-scoped change trail (timeline for a single record).
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await entityTrailRoutes(instance);
    },
    { prefix: "/entities" },
  );

  // Auto-purge activity logs older than 2 years. Idempotent; can be
  // disabled with ACTIVITY_PURGE_DISABLED=true in tests.
  if (process.env.ACTIVITY_PURGE_DISABLED !== "true") {
    activityPurgeJob.start();
  }

  // Marketing Campaigns — drip sequences / lead nurturing.
  // Tenant-scoped under /campaigns. The BullMQ workers are
  // started only when Redis is available; in dev the queue
  // helpers fall back to direct calls.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await campaignRoutes(instance);
    },
    { prefix: "/campaigns" },
  );

  if (campaignQueue.isEnabled()) {
    campaignQueue.startTriggerWorker();
    campaignQueue.startStepWorker();
    campaignQueue.startSweepWorker();
    app.addHook("onClose", async (): Promise<void> => {
      await campaignQueue.stopCampaignWorkers();
    });
  }

  // Duplicate detection & merge (customer side). Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await duplicateRoutes(instance);
    },
    { prefix: "/customers" },
  );

  // Customer intake + DL scan (mobile sales floor).
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await customerRoutes(instance);
    },
    { prefix: "/customers" },
  );

  // Customer CRUD + actions. Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await customersRoutes(instance);
    },
    { prefix: "/api/v1/customers" },
  );

  // Lead CRUD + pipeline actions. Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await leadsRoutes(instance);
    },
    { prefix: "/api/v1/leads" },
  );

  // Appointment calendar events. Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await appointmentsRoutes(instance);
    },
    { prefix: "/api/v1/appointments" },
  );

  // Test drive scheduling. Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await testDrivesRoutes(instance);
    },
    { prefix: "/api/v1/test-drives" },
  );

  // Polymorphic notes. Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await notesRoutes(instance);
    },
    { prefix: "/api/v1/notes" },
  );

  // Inventory list + VIN lookup (mobile + web).
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await inventoryRoutes(instance);
    },
    { prefix: "/inventory" },
  );

  // Full inventory management (CRUD, pricing, media, syndication).
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await inventoryFullRoutes(instance);
    },
    { prefix: "/api/v1/inventory" },
  );

  // Vehicle reference data (makes, models, years).
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await vehiclesRoutes(instance);
    },
    { prefix: "/api/v1/vehicles" },
  );

  // Pipeline stages management.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await pipelineRoutes(instance);
    },
    { prefix: "/api/v1/pipeline" },
  );

  // Finance & F&I products and deal desk.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await financeRoutes(instance);
    },
    { prefix: "/api/v1/finance" },
  );

  // Task management.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await tasksRoutes(instance);
    },
    { prefix: "/api/v1/tasks" },
  );

  // Support tickets.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await ticketsRoutes(instance);
    },
    { prefix: "/api/v1/tickets" },
  );

  // Dashboard KPIs (mobile home + web dashboard).
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await dashboardRoutes(instance);
    },
    { prefix: "/dashboard" },
  );

  // Duplicate detection for leads (lead → customer comparison).
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await leadDuplicateRoutes(instance);
    },
    { prefix: "/leads" },
  );

  // Dealer website (per-dealer public marketing site config).
  // Authenticated CRUD. Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await dealerWebsiteRoutes(instance);
    },
    { prefix: "/dealer-website" },
  );

  // Public read of the dealer website by subdomain / custom domain.
  // Used by the marketing Next.js app. No JWT required.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await publicDealerWebsiteRoutes(instance);
    },
    { prefix: "/public/dealer-website" },
  );

  // Notifications — the bell panel inbox. Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await notificationRoutes(instance);
    },
    { prefix: "/notifications" },
  );

  // Tasks — rep action items. Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await taskRoutes(instance);
    },
    { prefix: "/tasks" },
  );

  // AI Agents — NOVA, ARIO, SAGE, LUCAS. Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await aiAgentRoutes(instance);
    },
    { prefix: "/ai-agents" },
  );

  // Calendar — general-purpose events. Tenant-scoped.
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await calendarRoutes(instance);
    },
    { prefix: "/calendar" },
  );

  // Stats broadcast — emits KPI snapshots every 30s on the dealer's
  // WebSocket room. Toggle off in tests via STATS_BROADCAST_DISABLED.
  if (process.env.STATS_BROADCAST_DISABLED !== "true") {
    statsBroadcastJob.start();
  }

  // Billing — Stripe checkout, portal, subscription, usage, invoices.
  // Tenant-scoped. Webhooks are registered by the billing plugin under
  // /webhooks/stripe (public, raw-body verified).
  await app.register(
    async (instance: FastifyInstance): Promise<void> => {
      await billingRoutes(instance);
    },
    { prefix: "/billing" },
  );

  // Expose the on-lead-ingest hook for webhook handlers (fire-and-forget).
  app.decorate("onLeadIngest", onLeadIngest);
  app.decorate("onCustomerCreate", onCustomerCreate);

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    onLeadIngest: typeof onLeadIngest;
    onCustomerCreate: typeof onCustomerCreate;
  }
}

export default buildApp;
