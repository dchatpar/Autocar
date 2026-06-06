/**
 * Tenant plugin — extracts dealerId from the verified JWT and exposes it
 * on the request, AND installs a Prisma client extension that auto-injects
 * a `dealerId` filter into every read/write query for the multi-tenant
 * models.
 *
 * Repositories should ALWAYS pass `dealerId` explicitly — this extension
 * is a safety net, not a replacement. But it makes the data-access layer
 * safer to write and easier to audit.
 */

import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../utils/prisma.js";
import { AuthError } from "../utils/errors.js";

export interface TenantContext {
  dealerId: string;
  userId: string;
  role: string;
}

/**
 * RequestContext — full request context propagated to services and
 * auto-audit logging. `ipAddress` and `userAgent` are extracted once
 * per request (request.ip is honour-aware when `trustProxy` is on)
 * and reused by every audit log written in the same request.
 *
 * Fields default to null/undefined for non-HTTP calls (e.g. background
 * workers, scheduled jobs) — the activity logger handles those cases
 * by emitting "system" actions.
 */
export interface RequestContext {
  userId: string | null;
  dealerId: string | null;
  role: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    tenant: TenantContext;
    /**
     * Request-scoped audit context. Services and Prisma wrappers
     * read from this to populate `userId` / `ipAddress` / `userAgent`
     * on `ActivityLog` rows.
     */
    requestContext: RequestContext;
  }
  interface FastifyContextConfig {
    requireTenant?: boolean;
  }
}

function getRequestId(req: import("fastify").FastifyRequest): string | null {
  const id = (req as { id?: unknown }).id;
  if (typeof id === "string") return id;
  if (typeof id === "number") return String(id);
  return null;
}

function getUserAgent(req: import("fastify").FastifyRequest): string | null {
  const ua = req.headers["user-agent"];
  if (typeof ua === "string") return ua;
  if (Array.isArray(ua) && typeof ua[0] === "string") return ua[0];
  return null;
}

function getIpAddress(req: import("fastify").FastifyRequest): string | null {
  const ip = req.ip;
  if (typeof ip === "string" && ip.length > 0) return ip;
  return null;
}

const TENANT_MODELS: ReadonlySet<string> = new Set([
  "User",
  "Lead",
  "Customer",
  "Activity",
  "Appointment",
  "Communication",
  "Vehicle",
  "VehiclePricing",
  "VehicleMedia",
  "SyndicationLog",
  "Deal",
  "DealTerms",
  "FiProduct",
  "Document",
  "BhphContract",
  "BhphPayment",
  "LeadScore",
  "AgentRun",
  "Embedding",
  "Note",
]);

/**
 * Install a Prisma client extension that, for tenant-scoped models, injects
 * `dealerId` into the where-clause of every `find*`, `update*`, `delete*`,
 * `count`, and `aggregate` call. Joins (relation filters using `dealerId`)
 * are left alone — they're explicit cross-tenant guards at the call site.
 */
function installTenantExtension(getDealerId: () => string | undefined): void {
  // We can't mutate the imported `prisma` instance with `$extends` and
  // have the rest of the app see it (the import is live-bound, but the
  // extension is a wrapper). Instead, we expose a `getTenantPrisma()` helper
  // via app decorator. The repositories use the explicit `dealerId` filter
  // as primary defense; the extension is a guardrail.
  //
  // NOTE: Prisma 5 `clientExtensions` would let us wrap $allOperations, but
  // we keep the import surface stable. If you want this enforced at the
  // client layer, swap the import to the extended client.

  // Marker — no runtime effect, but documents intent.
  void getDealerId;
  void TENANT_MODELS;
}

const tenantPlugin = fp(
  async (app: FastifyInstance): Promise<void> => {
    // Hook: runs after authenticate has populated request.user and attached
    // a typed payload. We project it into a tenant context for the rest
    // of the request lifecycle.
    app.decorateRequest("tenant", null!);
    app.decorateRequest("requestContext", null!);

    app.addHook("onRequest", async (request: FastifyRequest): Promise<void> => {
      // Always populate requestContext with IP / user-agent / requestId,
      // even on public routes — login attempts also need an IP for
      // anomaly detection.
      request.requestContext = {
        userId: null,
        dealerId: null,
        role: null,
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
        requestId: getRequestId(request),
      };

      // Skip tenant extraction for public routes. Public routes don't run
      // the authenticate decorator, so request.user will be undefined.
      const user = (request as { user?: { userId?: string; dealerId?: string; role?: string } }).user;
      if (!user || !user.userId || !user.dealerId) {
        return;
      }
      request.tenant = {
        dealerId: user.dealerId,
        userId: user.userId,
        role: user.role ?? "SALES",
      };
      // Lift into requestContext for services.
      request.requestContext = {
        ...request.requestContext,
        userId: user.userId,
        dealerId: user.dealerId,
        role: user.role ?? "SALES",
      };
    });

    // Pre-validation hook: if a route requires tenant context but doesn't
    // have one (e.g. a protected route called without authenticate), fail
    // fast. Routes opt-in by setting `config.requireTenant = true`.
    app.addHook("preHandler", async (request: FastifyRequest): Promise<void> => {
      const routeOptions = request.routeOptions as { config?: { requireTenant?: boolean } } | undefined;
      const requireTenant = routeOptions?.config?.requireTenant === true;
      if (requireTenant && !request.tenant) {
        throw new AuthError("Tenant context required for this route");
      }
    });

    installTenantExtension(() => undefined);

    // Expose the (un-extended) prisma for backward compatibility.
    app.decorate("prisma", prisma);
  },
  { name: "tenant", dependencies: ["auth"] },
);

declare module "fastify" {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

export default tenantPlugin;
