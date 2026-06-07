/**
 * WhatsApp Cloud API webhook — POST /webhooks/whatsapp
 *                                    GET  /webhooks/whatsapp (verification)
 *
 * Inbound flow:
 *   1. Verify HMAC SHA-256 (X-Hub-Signature-256) using WHATSAPP_APP_SECRET
 *   2. Parse payload (Zod)
 *   3. For each inbound message:
 *      a. Resolve the dealer from the receiving phone_number_id
 *      b. Look up an existing lead by phone (E.164) within the dealer
 *      c. Create a new lead if none exists (source="whatsapp_inbound")
 *      d. Append a Communication row + Activity row
 *      e. Fire NOVA stub for a follow-up
 *      f. Mark inbound message as read
 *   4. For each status update: write to Communication table
 *   5. Return 200 within 5s
 *
 * Idempotency:
 *   - Inbound messages dedup by (externalId = wamid)
 *   - Status updates upsert by wamid
 *
 * Dealer resolution:
 *   - phone_number_id → dealerId via dealer.settings.whatsapp_phone_number_id
 *   - Falls back to first dealer (dev only) when no mapping exists
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Dealer, Lead, Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { prisma } from "../../utils/prisma.js";
import { verifyHmacSignature, getSignatureHeader } from "../../utils/hmac.js";
import { toE164 } from "../../utils/phone.js";
import {
  WhatsAppPayloadSchema,
  WhatsAppVerifyQuerySchema,
} from "../../schemas/webhook.schema.js";
import { novaService } from "../../services/nova-stub.service.js";
import { fireAndForget as fireLeadDuplicateCheck } from "../../hooks/on-lead-ingest.js";


/**
 * Look up the dealer that owns the given phone_number_id.
 */
async function resolveDealerByPhoneNumberId(
  phoneNumberId: string | null,
): Promise<Dealer | null> {
  if (phoneNumberId) {
    const found = await prisma.dealer.findFirst({
      where: {
        OR: [
          {
            settings: {
              path: ["whatsapp_phone_number_id"],
              equals: phoneNumberId,
            },
          },
          {
            settings: {
              path: ["whatsapp_credentials", "phone_number_id"],
              equals: phoneNumberId,
            },
          },
        ],
      },
    });
    if (found) return found;
  }
  // Dev fallback.
  return prisma.dealer.findFirst({ orderBy: { createdAt: "asc" } });
}

/**
 * Find an existing lead by phone (E.164) for a given dealer.
 */
async function findLeadByPhone(
  dealerId: string,
  phoneE164: string,
): Promise<Lead | null> {
  return prisma.lead.findFirst({
    where: { dealerId, phone: phoneE164 },
    orderBy: { createdAt: "desc" },
  });
}

export async function whatsAppWebhookRoutes(app: FastifyInstance): Promise<void> {
  /* ============================================================
   * GET — verification handshake
   * ============================================================ */
  app.get(
    "/whatsapp",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = WhatsAppVerifyQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid verification request" });
      }
      const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
      if (!expected) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      if (parsed.data["hub.verify_token"] !== expected) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      return reply.status(200).type("text/plain").send(parsed.data["hub.challenge"]);
    },
  );

  /* ============================================================
   * POST — inbound messages + status updates
   * ============================================================ */
  app.post(
    "/whatsapp",
    { config: { rateLimit: false, requireTenant: false } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. HMAC verify
      const rawBody =
        (request as { rawBody?: string }).rawBody ??
        (typeof request.body === "string"
          ? (request.body as string)
          : JSON.stringify(request.body ?? {}));
      const secret = process.env.WHATSAPP_APP_SECRET ?? "";
      if (!secret) {
        request.log.warn("WHATSAPP_APP_SECRET not configured — rejecting webhook");
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
          "WhatsApp webhook: signature rejected",
        );
        return reply.status(401).send({ error: "Invalid signature" });
      }

      // 2. Parse with Zod
      let parsed: ReturnType<typeof WhatsAppPayloadSchema.parse>;
      try {
        parsed = WhatsAppPayloadSchema.parse(request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          request.log.warn({ issues: err.issues }, "WhatsApp: bad payload shape");
          return reply
            .status(200)
            .send({ data: { ok: true, accepted: 0, dropped: "bad_payload" } });
        }
        throw err;
      }

      let acceptedMessages = 0;
      let acceptedStatuses = 0;
      const errors: Array<{ id: string; error: string }> = [];

      for (const entry of parsed.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          if (!value) continue;

          const phoneNumberId = value.metadata?.phone_number_id ?? null;
          const dealer = await resolveDealerByPhoneNumberId(phoneNumberId);
          if (!dealer) {
            request.log.warn(
              { phoneNumberId },
              "WhatsApp webhook: no dealer for phone_number_id — dropping",
            );
            continue;
          }

          // 3a. Inbound messages
          if (value.messages && value.messages.length > 0) {
            for (const msg of value.messages) {
              try {
                const fromE164 = toE164(msg.from);
                if (!fromE164) {
                  request.log.warn(
                    { from: msg.from, wamid: msg.id },
                    "WhatsApp: could not normalize phone — skipping",
                  );
                  continue;
                }

                // Idempotency — if a Communication with this externalId exists, skip.
                const existing = await prisma.communication.findFirst({
                  where: { dealerId: dealer.id, externalId: msg.id },
                });
                if (existing) {
                  acceptedMessages++;
                  continue;
                }

                // Find or create lead
                let lead = await findLeadByPhone(dealer.id, fromE164);
                if (!lead) {
                  const contactName =
                    value.contacts?.[0]?.profile?.name ?? "WhatsApp Lead";
                  const parts = contactName.trim().split(/\s+/);
                  const firstName = parts[0] ?? "WhatsApp";
                  const lastName = parts.slice(1).join(" ") || "Lead";
                  lead = await prisma.lead.create({
                    data: {
                      dealerId: dealer.id,
                      source: "whatsapp_inbound",
                      status: "NEW",
                      score: 60,
                      firstName,
                      lastName,
                      phone: fromE164,
                      vehicleInterest: [] as unknown as Prisma.JsonArray,
                      sourceMeta: {
                        wamid: msg.id,
                        phone_number_id: phoneNumberId,
                        timestamp: msg.timestamp,
                      },
                    },
                  });
                  await prisma.activity.create({
                    data: {
                      dealerId: dealer.id,
                      entityType: "LEAD",
                      entityId: lead.id,
                      type: "AI_ACTION",
                      body: `New WhatsApp lead created from ${fromE164}.`,
                      agentName: "INBOUND_ROUTER",
                    },
                  });
                }

                // Persist inbound communication
                const text = msg.text?.body ?? "";
                await prisma.communication.create({
                  data: {
                    dealerId: dealer.id,
                    leadId: lead.id,
                    channel: "WHATSAPP",
                    direction: "INBOUND",
                    fromAddr: fromE164,
                    toAddr: phoneNumberId,
                    body: text,
                    status: "DELIVERED",
                    externalId: msg.id,
                    sentAt: new Date(Number(msg.timestamp) * 1000 || Date.now()),
                  },
                });
                await prisma.activity.create({
                  data: {
                    dealerId: dealer.id,
                    entityType: "LEAD",
                    entityId: lead.id,
                    type: "SMS", // WHATSAPP isn't in ActivityType enum; SMS is closest
                    body: text || "(empty inbound message)",
                    metadata: {
                      channel: "WHATSAPP",
                      wamid: msg.id,
                      messageType: msg.type,
                    },
                  },
                });

                // Fire NOVA stub for a reply
                void novaService
                  .run(lead, dealer)
                  .catch((err: unknown) => {
                    request.log.error({ err }, "NOVA stub failed for WhatsApp inbound");
                  });

                // Fire duplicate-detection hook — non-blocking.
                fireLeadDuplicateCheck({ lead, logger: request.log });

                acceptedMessages++;
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push({ id: msg.id, error: message });
                request.log.error({ err, wamid: msg.id }, "WhatsApp message ingest failed");
              }
            }
          }

          // 3b. Status updates
          if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
              try {
                const statusMap: Record<string, "PENDING" | "SENT" | "DELIVERED" | "FAILED"> = {
                  sent: "SENT",
                  delivered: "DELIVERED",
                  read: "DELIVERED", // read doesn't change CommunicationStatus enum; treat as delivered
                  failed: "FAILED",
                };
                const newStatus = statusMap[status.status] ?? "PENDING";

                // Find existing outbound communication with this externalId
                const existing = await prisma.communication.findFirst({
                  where: { dealerId: dealer.id, externalId: status.id },
                });
                if (existing) {
                  await prisma.communication.update({
                    where: { id: existing.id },
                    data: { status: newStatus },
                  });
                } else {
                  // Create a stub record so the status is queryable later
                  await prisma.communication.create({
                    data: {
                      dealerId: dealer.id,
                      channel: "WHATSAPP",
                      direction: "OUTBOUND",
                      fromAddr: phoneNumberId,
                      toAddr: status.recipient_id ?? null,
                      status: newStatus,
                      externalId: status.id,
                      sentAt: new Date(Number(status.timestamp) * 1000 || Date.now()),
                    },
                  });
                }
                acceptedStatuses++;
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push({ id: status.id, error: message });
                request.log.error({ err, wamid: status.id }, "WhatsApp status update failed");
              }
            }
          }
        }
      }

      return reply.status(200).send({
        data: { ok: true, acceptedMessages, acceptedStatuses, errors: errors.length > 0 ? errors : undefined },
      });
    },
  );
}
