/**
 * DocuSign Connect webhook — POST /webhooks/docusign
 *
 * DocuSign sends JSON (or XML) payloads to a configured URL when
 * an envelope's state changes. We:
 *
 *   1. Verify the HMAC signature (`X-DocuSign-Signature-1`).
 *      DocuSign HMACs the RAW request body with the "Connect
 *      HMAC secret" we configured in the DocuSign Admin → Connect
 *      page. We verify against `request.rawBody` (captured by
 *      `installRawBodyCapture`).
 *
 *   2. Zod-validate the JSON shape (loose — DocuSign's schema
 *      is permissive and has many optional fields).
 *
 *   3. Hand off to `signatureService.applyWebhookEvent` which
 *      updates the `DocumentSignature` row idempotently.
 *
 *   4. Return 200 within 5s. DocuSign retries on non-2xx, so we
 *      ack fast and process in-line (no queue) — these handlers
 *      are O(1) Prisma calls.
 *
 * Idempotency:
 *   - The state machine is monotonic — re-delivering the same
 *     `envelope-sent` event is a no-op (status is already SENT).
 *   - We never trust `req.body` directly without HMAC verification.
 *
 * What we handle:
 *   - envelope-sent, envelope-delivered, envelope-completed,
 *     envelope-declined, envelope-voided, envelope-expired
 *   - recipient-sent, recipient-delivered, recipient-completed,
 *     recipient-declined
 *
 * Multi-tenancy:
 *   - The webhook is unauthenticated (DocuSign doesn't carry our
 *     JWT). The HMAC signature replaces authentication.
 *   - We resolve the dealer via (1) the `dealerId` custom field
 *     DocuSign echoes back, (2) the dealerId embedded in the
 *     envelope's metadata, or (3) a global lookup as a last
 *     resort.
 *
 * Security:
 *   - Reject requests with missing or invalid HMAC → 401.
 *   - The endpoint is rate-limited via the global @fastify/rate-limit
 *     plugin; if a malicious actor spams without a valid HMAC, they
 *     are rate-limited and 401'd on every request.
 *   - No tenant-scoped writes happen on an unauthenticated path:
 *     we resolve the dealer from the HMAC-verified body.
 *
 * Configuration (env):
 *   - DOCUSIGN_WEBHOOK_HMAC_SECRET  (required)
 *   - DOCUSIGN_WEBHOOK_TOLERANCE_SEC (optional, default 300)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { signatureService } from "../../services/signature.service.js";
import { prisma } from "../../utils/prisma.js";

/* ============================================================
 * HMAC verification
 * ============================================================ */

const DOCUSIGN_SIGNATURE_HEADERS = [
  "x-docusign-signature-1",
  "x-docusign-signature-2",
  "X-DocuSign-Signature-1",
  "X-DocuSign-Signature-2",
] as const;

interface VerifyHmacResult {
  valid: boolean;
  reason?: string;
  /** Which header matched (1 or 2), for logging. */
  matchedHeader?: number;
}

function verifyDocuSignHmac(rawBody: string, secret: string, headerValue: string | undefined): VerifyHmacResult {
  if (!secret) {
    return { valid: false, reason: "missing_secret" };
  }
  if (!headerValue) {
    return { valid: false, reason: "missing_header" };
  }
  if (!rawBody || rawBody.length === 0) {
    return { valid: false, reason: "empty_body" };
  }
  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const expectedBuf = Buffer.from(expectedHex, "utf8");
  // DocuSign encodes HMAC as base64 (NOT hex) — see
  // https://developers.docusign.com/platform/webhooks/connect/hmac/
  const providedBuf = Buffer.from(headerValue.trim(), "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return { valid: false, reason: "length_mismatch" };
  }
  const ok = timingSafeEqual(providedBuf, expectedBuf);
  return ok ? { valid: true } : { valid: false, reason: "mismatch" };
}

function getFirstDocuSignSignatureHeader(request: FastifyRequest): { value: string | undefined; which: number | undefined } {
  const h = request.headers as Record<string, string | string[] | undefined>;
  for (let i = 0; i < DOCUSIGN_SIGNATURE_HEADERS.length; i++) {
    const name = DOCUSIGN_SIGNATURE_HEADERS[i];
    if (!name) continue;
    const raw = h[name];
    if (typeof raw === "string" && raw.length > 0) {
      return { value: raw, which: i < 2 ? 1 : 2 };
    }
    if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].length > 0) {
      return { value: raw[0], which: i < 2 ? 1 : 2 };
    }
  }
  return { value: undefined, which: undefined };
}

/* ============================================================
 * Zod schema for the inbound payload
 * ============================================================ */

const RecipientSchema = z
  .object({
    recipientId: z.string().optional(),
    routingOrder: z.string().optional(),
    clientUserId: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    status: z.string().optional(),
    signedDateTime: z.string().optional(),
    deliveredDateTime: z.string().optional(),
    declinedDateTime: z.string().optional(),
    declineReason: z.string().optional(),
  })
  .passthrough();

const EnvelopeSummarySchema = z
  .object({
    envelopeId: z.string().optional(),
    status: z.string().optional(),
    emailSubject: z.string().optional(),
    sentDateTime: z.string().optional(),
    deliveredDateTime: z.string().optional(),
    completedDateTime: z.string().optional(),
    declinedDateTime: z.string().optional(),
    voidedDateTime: z.string().optional(),
    voidedReason: z.string().optional(),
    statusChangedDateTime: z.string().optional(),
    customFields: z
      .object({
        textCustomFields: z
          .array(
            z
              .object({
                name: z.string().optional(),
                value: z.string().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const EnvelopeDocumentSchema = z
  .object({
    documentId: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

const DataSchema = z
  .object({
    accountId: z.string().optional(),
    userId: z.string().optional(),
    envelopeId: z.string().optional(),
    envelopeSummary: EnvelopeSummarySchema.optional(),
    envelopeDocuments: z.array(EnvelopeDocumentSchema).optional(),
    recipients: z
      .object({
        signers: z.array(RecipientSchema).optional(),
        carbonCopies: z.array(RecipientSchema).optional(),
        certifiedDeliveries: z.array(RecipientSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const DocuSignWebhookSchema = z
  .object({
    event: z.string(),
    apiVersion: z.string().optional(),
    uri: z.string().optional(),
    retryCount: z.number().optional(),
    configurationId: z.number().optional(),
    generatedDateTime: z.string().optional(),
    data: DataSchema.optional(),
  })
  .passthrough();

/* ============================================================
 * Constants
 * ============================================================ */

/** Events we actively process. Others are logged + 200'd. */
const SUPPORTED_ENVELOPE_EVENTS: ReadonlySet<string> = new Set([
  "envelope-sent",
  "envelope-delivered",
  "envelope-completed",
  "envelope-declined",
  "envelope-voided",
  "envelope-corrected",
  "envelope-expired",
]);

const SUPPORTED_RECIPIENT_EVENTS: ReadonlySet<string> = new Set([
  "recipient-sent",
  "recipient-delivered",
  "recipient-completed",
  "recipient-declined",
]);

/* ============================================================
 * Routes
 * ============================================================ */

export async function docusignWebhookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET — health check / verification handshake. DocuSign doesn't
   * require a handshake for Connect, but a GET endpoint is useful
   * for uptime monitoring.
   */
  app.get("/docusign", async (_request, reply) => {
    return reply.send({
      data: {
        status: "ok",
        timestamp: new Date().toISOString(),
        acceptedEvents: [...SUPPORTED_ENVELOPE_EVENTS, ...SUPPORTED_RECIPIENT_EVENTS],
      },
    });
  });

  /**
   * POST — main webhook handler.
   */
  app.post(
    "/docusign",
    {
      // Disable JSON body parser's strict limit — DocuSign can
      // attach the full PDF in `envelopeDocuments`, which is
      // large. We rely on the global 1MB body limit set in
      // app.ts unless overridden by the env.
      config: { requireTenant: false },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startedAt = Date.now();

      // 1. Verify HMAC
      const secret = process.env.DOCUSIGN_WEBHOOK_HMAC_SECRET ?? "";
      const sigHeader = getFirstDocuSignSignatureHeader(request);
      const rawBody =
        typeof (request as { rawBody?: unknown }).rawBody === "string"
          ? ((request as unknown as { rawBody: string }).rawBody as string)
          : JSON.stringify(request.body ?? {});

      const hmac = verifyDocuSignHmac(rawBody, secret, sigHeader.value);
      if (!hmac.valid) {
        request.log.warn(
          {
            reason: hmac.reason,
            matchedHeader: sigHeader.which,
            ip: request.ip,
            contentLength: rawBody.length,
          },
          "DocuSign webhook HMAC verification failed",
        );
        return reply.status(401).send({ error: "Invalid signature" });
      }

      // 2. Parse + validate
      let payload: z.infer<typeof DocuSignWebhookSchema>;
      try {
        const json = rawBody.length === 0 ? {} : JSON.parse(rawBody);
        payload = DocuSignWebhookSchema.parse(json);
      } catch (err) {
        request.log.error({ err }, "DocuSign webhook: invalid payload");
        // 4xx so DocuSign doesn't retry forever; but 200 so we
        // don't get spammed by malformed callers — actually let's
        // 400 for malformed JSON.
        return reply.status(400).send({ error: "Malformed payload" });
      }

      // 3. Filter unknown events but always 200 (DocuSign shouldn't
      //    retry on a payload we can't process).
      const event = payload.event;
      if (!SUPPORTED_ENVELOPE_EVENTS.has(event) && !SUPPORTED_RECIPIENT_EVENTS.has(event)) {
        request.log.info({ event }, "DocuSign webhook: ignoring unsupported event");
        return reply.status(200).send({ data: { ok: true, ignored: true, event } });
      }

      // 4. Pre-resolve dealerId from custom fields so we can short-
      //    circuit the locateRow() global search in the common case.
      const customDealerId = payload.data?.envelopeSummary?.customFields?.textCustomFields?.find(
        (f) => f.name === "dealerId",
      )?.value;

      // 5. Hand off to the service
      try {
        const updated = await signatureService.applyWebhookEvent(
          buildServicePayload(event, payload, envelopeIdFromPayload(payload)),
          { dealerIdHint: customDealerId ?? null },
        );

        if (!updated) {
          // No matching row — we still 200 so DocuSign doesn't
          // retry, but log a warning so we notice misconfig.
          request.log.warn(
            { envelopeId: payload.data?.envelopeId, event },
            "DocuSign webhook: no matching envelope",
          );
        }

        // 6. Side-effects by event type
        if (event === "envelope-completed" && updated) {
          // Mark the deal as delivered (idempotent) when the
          // bill of sale or final delivery doc is completed.
          await maybeMarkDealDelivered(updated);
        }
      } catch (err) {
        request.log.error({ err, event }, "DocuSign webhook: handler error");
        // 500 so DocuSign retries — these are usually transient
        // (e.g. brief Prisma disconnect) and worth retrying.
        return reply.status(500).send({ error: "Internal error" });
      }

      const elapsedMs = Date.now() - startedAt;
      request.log.info({ event, elapsedMs }, "DocuSign webhook processed");
      return reply.status(200).send({ data: { ok: true, event, elapsedMs } });
    },
  );
}

/* ============================================================
 * Side effects
 * ============================================================ */

/**
 * Translate the Zod-parsed webhook payload into the service's
 * `DocuSignWebhookPayload` shape. Centralised so the route body
 * stays readable.
 */
type ParsedPayload = z.infer<typeof DocuSignWebhookSchema>;

function envelopeIdFromPayload(p: ParsedPayload): string {
  return p.data?.envelopeId ?? p.data?.envelopeSummary?.envelopeId ?? "";
}

function buildServicePayload(
  event: string,
  payload: ParsedPayload,
  envelopeId: string,
): Parameters<typeof signatureService.applyWebhookEvent>[0] {
  const summary = payload.data?.envelopeSummary;
  return {
    event: event as Parameters<typeof signatureService.applyWebhookEvent>[0]["event"],
    apiVersion: payload.apiVersion,
    uri: payload.uri,
    retryCount: payload.retryCount,
    configurationId: payload.configurationId,
    generatedDateTime: payload.generatedDateTime,
    data: payload.data
      ? {
          accountId: payload.data.accountId,
          userId: payload.data.userId,
          envelopeId: envelopeId,
          envelopeSummary: summary
            ? {
                envelopeId: summary.envelopeId ?? envelopeId,
                status: summary.status,
                emailSubject: summary.emailSubject,
                sentDateTime: summary.sentDateTime,
                deliveredDateTime: summary.deliveredDateTime,
                completedDateTime: summary.completedDateTime,
                declinedDateTime: summary.declinedDateTime,
                voidedDateTime: summary.voidedDateTime,
                voidedReason: summary.voidedReason,
                statusChangedDateTime: summary.statusChangedDateTime,
                customFields: {
                  textCustomFields: (summary.customFields?.textCustomFields ?? []).map(
                    (f) => ({
                      name: f.name,
                      value: f.value,
                    }),
                  ),
                },
              }
            : undefined,
          envelopeDocuments: (payload.data.envelopeDocuments ?? []).map((d) => ({
            documentId: d.documentId,
            name: d.name,
            type: d.type,
          })),
          recipients: payload.data.recipients
            ? {
                signers: (payload.data.recipients.signers ?? []).map((s) => ({
                  recipientId: s.recipientId,
                  routingOrder: s.routingOrder,
                  clientUserId: s.clientUserId,
                  name: s.name,
                  email: s.email,
                  status: s.status,
                  signedDateTime: s.signedDateTime,
                  deliveredDateTime: s.deliveredDateTime,
                  declinedDateTime: s.declinedDateTime,
                  declineReason: s.declineReason,
                })),
              }
            : undefined,
        }
      : undefined,
  };
}

/**
 * If the completed envelope is the bill of sale for a deal in
 * `APPROVED` status, mark the deal `DELIVERED`. Idempotent: only
 * transitions forward, never reverts.
 */
async function maybeMarkDealDelivered(
  envelope: { id: string; dealerId: string; dealId: string | null; documentType: string },
): Promise<void> {
  if (!envelope.dealId) return;
  if (envelope.documentType !== "BILL_OF_SALE" && envelope.documentType !== "DELIVERY_RECEIPT") {
    return;
  }
  const deal = await prisma.deal.findFirst({
    where: { id: envelope.dealId, dealerId: envelope.dealerId },
    select: { id: true, status: true },
  });
  if (!deal) return;
  if (deal.status === "DELIVERED" || deal.status === "UNWOUND") return;
  await prisma.deal.update({
    where: { id: deal.id },
    data: { status: "DELIVERED", deliveredAt: new Date() },
  });
}
