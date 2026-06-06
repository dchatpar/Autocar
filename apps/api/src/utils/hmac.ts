/**
 * HMAC SHA-256 signature verification for inbound webhooks.
 *
 * Two main use-cases:
 *   1. Meta Lead Ads — header `X-Hub-Signature-256: sha256=<hex>`
 *   2. WhatsApp Cloud API — header `X-Hub-Signature-256: sha256=<hex>`
 *
 * Both use the same pattern. We use timing-safe comparison to avoid
 * leaking information through response-time differences.
 *
 * Body handling:
 *   - Meta signs the RAW request body. Fastify may parse JSON into an
 *     object before our handler runs, so we MUST verify against the raw
 *     string. We read `request.rawBody` (set by a content-type parser hook)
 *     or fall back to `JSON.stringify(request.body)`. We recommend the
 *     rawBody hook — see `installRawBodyCapture` below.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";

const HEADER_NAME = "x-hub-signature-256";
const PREFIX = "sha256=";

export interface VerifySignatureInput {
  /** The raw request body (string or Buffer). */
  rawBody: string | Buffer;
  /** The signature header value, e.g. "sha256=abcdef..." */
  signatureHeader: string | undefined;
  /** The shared secret used to compute the HMAC. */
  secret: string;
}

export interface VerifySignatureResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify an HMAC SHA-256 signature.
 *
 * Returns `{ valid: true }` on match, or `{ valid: false, reason }` on
 * any failure (missing header, bad prefix, length mismatch, mismatch).
 * Never throws.
 */
export function verifyHmacSignature(input: VerifySignatureInput): VerifySignatureResult {
  const { rawBody, signatureHeader, secret } = input;

  if (!signatureHeader) {
    return { valid: false, reason: "missing_signature_header" };
  }
  if (!signatureHeader.startsWith(PREFIX)) {
    return { valid: false, reason: "bad_signature_prefix" };
  }
  if (!secret) {
    return { valid: false, reason: "missing_secret" };
  }

  const providedHex = signatureHeader.slice(PREFIX.length).trim();
  if (!/^[0-9a-f]+$/i.test(providedHex)) {
    return { valid: false, reason: "bad_signature_encoding" };
  }

  const expectedHex = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // timingSafeEqual requires equal-length buffers.
  const providedBuf = Buffer.from(providedHex, "hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");

  if (providedBuf.length !== expectedBuf.length) {
    return { valid: false, reason: "length_mismatch" };
  }

  const ok = timingSafeEqual(providedBuf, expectedBuf);
  return ok ? { valid: true } : { valid: false, reason: "mismatch" };
}

/**
 * Convenience: extract the signature header from a Fastify request,
 * case-insensitively. Returns `undefined` if missing.
 */
export function getSignatureHeader(request: FastifyRequest): string | undefined {
  const headers = request.headers as Record<string, string | string[] | undefined>;
  const raw = headers[HEADER_NAME] ?? headers["X-Hub-Signature-256"];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/**
 * Compute an HMAC SHA-256 signature for the given body. Useful for tests
 * and for the outbound CAPI client (which signs requests with Meta's
 * pixel access token, not HMAC — but this helper is here for parity).
 */
export function signHmacSha256(body: string | Buffer, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Install a content-type parser that captures the raw body string before
 * JSON parsing. This lets the webhook handlers verify the HMAC against
 * the bytes Meta actually signed.
 *
 * Usage:
 *   await app.register(installRawBodyCapture);
 *
 * After this, `request.rawBody` will be a string for JSON content-types.
 */
export async function installRawBodyCapture(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      try {
        const raw = typeof body === "string" ? body : body.toString("utf8");
        (request as { rawBody?: string }).rawBody = raw;
        const parsed = raw.length === 0 ? {} : (JSON.parse(raw) as unknown);
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
}
