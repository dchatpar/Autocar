/**
 * Meta Lead Ads webhook — POST /webhooks/meta/leads
 *                              GET  /webhooks/meta/leads (verification)
 *
 * Inbound flow:
 *   1. Verify HMAC SHA-256 (X-Hub-Signature-256) using META_APP_SECRET
 *   2. Parse payload (Zod)
 *   3. For each lead_data / change.value: extract fields, look up
 *      dealer, dedup by leadgen_id, run lead-router.service, insert
 *      lead + LeadRoutingLog, fire NOVA stub
 *   4. Return 200 within 5s (Meta retries on slow / non-2xx)
 *
 * Idempotency:
 *   - We dedup by `source_meta.leadgen_id` per dealer. The JSON column
 *     makes this a `path: ["source_meta", "leadgen_id"]` String equals
 *     query, which Prisma supports via raw.
 *
 * Dealer resolution:
 *   - Map `entry[].id` (page_id) → dealerId via dealer.settings.meta_page_id
 *   - Fall back to a single "default dealer" (dev only) if configured
 *   - If neither: drop the lead and 200 (Meta will not retry; the lead
 *     is logged in our system for manual review)
 *
 * Tenant scoping:
 *   - The webhook itself is unauthenticated (Meta can't carry our JWT).
 *     All DB queries are scoped via the resolved dealerId.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../utils/prisma.js";
import { verifyHmacSignature, getSignatureHeader } from "../../utils/hmac.js";
import { toE164 } from "../../utils/phone.js";
import { MetaLeadsPayloadSchema, MetaVerifyQuerySchema } from "../../schemas/webhook.schema.js";
import type { Dealer, Lead, Prisma } from "@prisma/client";
import { leadRouter, recordRoutingDecision } from "../../services/lead-router.service.js";
import { novaService } from "../../services/nova-stub.service.js";
import { DealerRoutingSettingsSchema } from "../../schemas/lead-router.schema.js";
import { fireAndForget as fireLeadDuplicateCheck } from "../../hooks/on-lead-ingest.js";
import { ZodError } from "zod";

interface NormalizedLead {
  leadgenId: string;
  pageId: string | null;
  formId: string | null;
  adId: string | null;
  adsetId: string | null;
  campaignId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  vehicleInterest: string | null;
  source: "meta_lead_ad" | "click_to_whatsapp";
  sourceMeta: Record<string, unknown>;
  raw: Record<string, unknown>;
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function extractField(fieldData: Array<{ name: string; values: string[] }>, name: string): string {
  for (const f of fieldData) {
    if (f.name.toLowerCase() === name.toLowerCase()) {
      return f.values[0] ?? "";
    }
  }
  return "";
}

/**
 * Coerce a Meta change.value into a NormalizedLead. Returns null if
 * the change is malformed or carries no leadgen_id.
 */
function normalizeChange(
  entry: { id?: string; time?: number },
  change: { value?: Record<string, unknown> | undefined },
): NormalizedLead | null {
  const v = change.value;
  if (!v) return null;

  // 1. Resolve leadgen_id — prefer the change-level, else embedded lead_data.id.
  const leadgenId = asString(v.leadgen_id) || asString((v.lead_data as { id?: unknown } | undefined)?.id);
  if (!leadgenId) return null;

  // 2. Resolve page_id — entry.id (page) or change.value.page_id.
  const pageId = entry.id ?? asString(v.page_id) ?? null;
  const formId = asString(v.form_id) || null;
  const adId = asString(v.ad_id) || null;
  const adsetId = asString(v.adset_id) || null;
  const campaignId = asString(v.campaign_id) || null;

  // 3. Field data — check both change.value and embedded lead_data.
  let fieldData: Array<{ name: string; values: string[] }> = [];
  if (Array.isArray(v.field_data)) {
    fieldData = v.field_data as Array<{ name: string; values: string[] }>;
  } else {
    const embedded = v.lead_data as { field_data?: unknown } | undefined;
    if (embedded && Array.isArray(embedded.field_data)) {
      fieldData = embedded.field_data as Array<{ name: string; values: string[] }>;
    }
  }

  // 4. First / last name — Meta can deliver one of three patterns.
  let firstName = extractField(fieldData, "first_name");
  let lastName = extractField(fieldData, "last_name");
  if (!firstName && !lastName) {
    const fullName = extractField(fieldData, "full_name");
    if (fullName) {
      const parts = fullName.trim().split(/\s+/);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }
  }
  if (!firstName) firstName = extractField(fieldData, "name"); // fallback
  if (!firstName) firstName = "Unknown";

  const email = extractField(fieldData, "email") || null;
  const phoneRaw = extractField(fieldData, "phone_number") || extractField(fieldData, "phone");
  const phone = phoneRaw ? toE164(phoneRaw) : null;
  const vehicleRaw =
    extractField(fieldData, "interested_vehicle") ||
    extractField(fieldData, "vehicle") ||
    extractField(fieldData, "vehicle_interest");
  const vehicleInterest = vehicleRaw || null;

  // 5. Source detection — click_to_whatsapp comes from a different
  //    Meta form template (Ads that click to WhatsApp).
  const formIdStr = formId ?? "";
  const source: "meta_lead_ad" | "click_to_whatsapp" =
    formIdStr.startsWith("wa_") || (typeof v.lead_source === "string" && v.lead_source === "click_to_whatsapp")
      ? "click_to_whatsapp"
      : "meta_lead_ad";

  return {
    leadgenId,
    pageId,
    formId,
    adId,
    adsetId,
    campaignId,
    firstName,
    lastName,
    email,
    phone,
    vehicleInterest,
    source,
    sourceMeta: {
      leadgen_id: leadgenId,
      page_id: pageId,
      form_id: formId,
      ad_id: adId,
      adset_id: adsetId,
      campaign_id: campaignId,
      raw: v,
    },
    raw: v as Record<string, unknown>,
  };
}

/**
 * Resolve a dealer from a Meta page_id. Returns null if we can't
 * match — the caller will drop the lead and 200.
 */
async function resolveDealer(
  pageId: string | null,
): Promise<Dealer | null> {
  // 1. Search all dealers whose settings.meta_page_id matches.
  //    We use a `path` query on the JSON column.
  if (pageId) {
    const found = await prisma.dealer.findFirst({
      where: {
        settings: {
          path: ["meta_page_id"],
          equals: pageId,
        },
      },
    });
    if (found) return found;
  }
  // 2. Dev fallback — first dealer with default_dealer_id=true.
  const fallback = await prisma.dealer.findFirst({
    where: {
      settings: {
        path: ["default_dealer_id"],
        equals: "true",
      },
    },
  });
  if (fallback) return fallback;
  // 3. Last resort — any dealer (single-tenant dev mode).
  const any = await prisma.dealer.findFirst({ orderBy: { createdAt: "asc" } });
  return any;
}

/**
 * Has a lead with this `leadgen_id` already been ingested for this dealer?
 * Returns the existing lead or null.
 */
async function findExistingLead(
  dealerId: string,
  leadgenId: string,
): Promise<Lead | null> {
  // source_meta is Json; we filter via `path` equality.
  return prisma.lead.findFirst({
    where: {
      dealerId,
      sourceMeta: {
        path: ["leadgen_id"],
        equals: leadgenId,
      },
    },
  });
}

export async function metaLeadsWebhookRoutes(app: FastifyInstance): Promise<void> {
  /* ============================================================
   * GET — verification handshake
   * ============================================================ */
  app.get(
    "/leads",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = MetaVerifyQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid verification request" });
      }
      const expected = process.env.META_VERIFY_TOKEN ?? "";
      if (!expected) {
        request.log.warn("META_VERIFY_TOKEN not configured — rejecting verification");
        return reply.status(403).send({ error: "Forbidden" });
      }
      if (parsed.data["hub.verify_token"] !== expected) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      // Meta expects a plain-text challenge response.
      return reply.status(200).type("text/plain").send(parsed.data["hub.challenge"]);
    },
  );

  /* ============================================================
   * POST — inbound lead notification
   * ============================================================ */
  app.post(
    "/leads",
    {
      config: { rateLimit: false, requireTenant: false },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. HMAC verify against the raw body.
      const rawBody =
        (request as { rawBody?: string }).rawBody ??
        (typeof request.body === "string"
          ? (request.body as string)
          : JSON.stringify(request.body ?? {}));
      const secret = process.env.META_APP_SECRET ?? "";
      if (!secret) {
        request.log.warn("META_APP_SECRET not configured — rejecting webhook");
        return reply.status(500).send({ error: "Webhook misconfigured" });
      }
      const sigResult = verifyHmacSignature({
        rawBody,
        signatureHeader: getSignatureHeader(request),
        secret,
      });
      if (!sigResult.valid) {
        request.log.warn(
          { reason: sigResult.reason },
          "Meta Lead Ads webhook: signature rejected",
        );
        return reply.status(401).send({ error: "Invalid signature" });
      }

      // 2. Parse with Zod (lenient on unknown fields).
      let parsed: ReturnType<typeof MetaLeadsPayloadSchema.parse>;
      try {
        parsed = MetaLeadsPayloadSchema.parse(request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          request.log.warn({ issues: err.issues }, "Meta Lead Ads: bad payload shape");
          // Acknowledge anyway — Meta shouldn't keep retrying a malformed payload.
          return reply.status(200).send({ data: { ok: true, accepted: 0, dropped: "bad_payload" } });
        }
        throw err;
      }

      // 3. Walk entry[*].changes[*] → normalized leads.
      const normalized: NormalizedLead[] = [];
      for (const entry of parsed.entry) {
        for (const change of entry.changes) {
          if (!change.value) continue;
          const n = normalizeChange(entry, change.value as Record<string, unknown>);
          if (n) normalized.push(n);
        }
      }

      if (normalized.length === 0) {
        return reply.status(200).send({ data: { ok: true, accepted: 0 } });
      }

      // 4. Ingest each lead (sequentially — keeps timing predictable
      //    inside the 5s budget; we can parallelize per-dealer later).
      let accepted = 0;
      let deduped = 0;
      let dropped = 0;
      const errors: Array<{ leadgenId: string; error: string }> = [];

      for (const n of normalized) {
        try {
          const dealer = await resolveDealer(n.pageId);
          if (!dealer) {
            dropped++;
            request.log.warn(
              { pageId: n.pageId, leadgenId: n.leadgenId },
              "No dealer matched for Meta page — dropping lead",
            );
            continue;
          }

          // Idempotency check
          const existing = await findExistingLead(dealer.id, n.leadgenId);
          if (existing) {
            deduped++;
            continue;
          }

          // Build a lead-shaped object for the router (no DB id yet).
          const leadInput: Lead = {
            id: "pending",
            dealerId: dealer.id,
            source: n.source,
            status: "NEW",
            score: 50,
            currentScore: 50,
            classification: "cold",
            lastScoredAt: null,
            lastContactedAt: null,
            unsubscribed: false,
            bounced: false,
            assignedToId: null,
            customerId: null,
            firstName: n.firstName,
            lastName: n.lastName,
            email: n.email,
            phone: n.phone,
            vehicleInterest: n.vehicleInterest
              ? ([{ title: n.vehicleInterest }] as unknown as Prisma.JsonArray)
              : ([] as unknown as Prisma.JsonArray),
            sourceMeta: n.sourceMeta as unknown as Prisma.JsonObject,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const decision = await leadRouter.routeLead({
            lead: leadInput,
            dealer,
          });

          // Persist lead + assignedTo + routing log in a single tx.
          const created = await prisma.$transaction(async (tx) => {
            const lead = await tx.lead.create({
              data: {
                dealerId: dealer.id,
                source: n.source,
                status: "NEW",
                score: 50,
                firstName: n.firstName,
                lastName: n.lastName,
                email: n.email,
                phone: n.phone,
                vehicleInterest: leadInput.vehicleInterest as unknown as Prisma.InputJsonValue,
                sourceMeta: leadInput.sourceMeta as unknown as Prisma.InputJsonValue,
                assignedToId: decision.assignedTo,
              },
            });
            await tx.leadRoutingLog.create({
              data: {
                dealerId: dealer.id,
                leadId: lead.id,
                strategyUsed: decision.strategy,
                candidateReps: decision.candidateReps as unknown as Prisma.InputJsonValue,
                selectedRepId: decision.assignedTo,
                reason: decision.reason,
                responseTimeMs: decision.responseTimeMs,
              },
            });
            await tx.activity.create({
              data: {
                dealerId: dealer.id,
                entityType: "LEAD",
                entityId: lead.id,
                type: "AI_ACTION",
                body: `Routed to ${decision.assignedTo ?? "no-one"} via ${decision.strategy}. ${decision.reason}`,
                agentName: "ROUTER",
              },
            });
            return lead;
          });

          // Fire NOVA — never block the response.
          void novaService
            .run(created, dealer)
            .catch((err: unknown) => {
              request.log.error({ err }, "NOVA stub failed for meta lead");
            });

          // Fire duplicate-detection hook — non-blocking, logs internally.
          fireLeadDuplicateCheck({ lead: created, logger: request.log });

          accepted++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ leadgenId: n.leadgenId, error: message });
          request.log.error(
            { err, leadgenId: n.leadgenId },
            "Meta Lead Ads: failed to ingest lead",
          );
        }
      }

      return reply.status(200).send({
        data: { ok: true, accepted, deduped, dropped, errors: errors.length > 0 ? errors : undefined },
      });
    },
  );
}

// Avoid unused-import false positives in strict mode
void recordRoutingDecision;
void DealerRoutingSettingsSchema;
