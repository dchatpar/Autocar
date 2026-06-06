/**
 * Twilio SMS Client.
 *
 * Wraps Twilio's Programmable SMS API for DealerOS outbound SMS —
 * drip campaign messages, appointment reminders, AI follow-ups, etc.
 *
 * Why not the official `twilio` SDK?
 *   - We don't need the full SDK surface (no Studio / Verify / Voice
 *     flows). A thin fetch wrapper keeps the dependency footprint
 *     small and matches the pattern of the WhatsApp + SendGrid
 *     clients in this codebase.
 *   - Twilio's REST API is simple enough to call directly with
 *     Basic auth: `Authorization: Base64(accountSid:authToken)`.
 *
 * Credentials precedence:
 *   1. `dealer.settings.twilio_credentials.{account_sid, auth_token,
 *       from_number}`
 *   2. env vars TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *
 * In dev (no creds), `sendSms` returns a synthetic
 * `{ messageSid: "dev_tw_…" }` so the rest of the pipeline keeps
 * moving. The same path is taken in unit tests.
 *
 * Phone numbers:
 *   - We always send to the E.164 representation of the destination
 *     number. Callers should pass E.164 strings; we do a defensive
 *     check and re-format via libphonenumber-js.
 */

import { envOr, resolveCredential } from "../shared/credentials.js";
import { isValidE164, toE164 } from "../../utils/phone.js";

const API_BASE = envOr("TWILIO_API_BASE", "https://api.twilio.com");
const API_VERSION = envOr("TWILIO_API_VERSION", "2010-04-01");

export interface SendSmsResult {
  messageSid: string;
  /** True when we returned a dev placeholder because creds are missing. */
  dev: boolean;
}

export interface SendSmsInput {
  to: string;
  body: string;
  /** Override the from number for this single send. */
  from?: string;
  /** Optional status callback URL — Twilio POSTs delivery events here. */
  statusCallback?: string;
  /** Optional arbitrary key/value metadata, max 10 keys, 256 chars each. */
  mediaUrls?: string[];
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

function resolveCreds(dealerSettings: unknown): TwilioCredentials | null {
  const sid = resolveCredential(
    dealerSettings,
    "twilio_account_sid",
    "TWILIO_ACCOUNT_SID",
  );
  const token = resolveCredential(
    dealerSettings,
    "twilio_auth_token",
    "TWILIO_AUTH_TOKEN",
  );
  const from = resolveCredential(
    dealerSettings,
    "twilio_from_number",
    "TWILIO_FROM_NUMBER",
  );
  if (!sid.value || !token.value || !from.value) return null;
  return {
    accountSid: sid.value,
    authToken: token.value,
    fromNumber: from.value,
  };
}

function devMessageSid(prefix: string): string {
  return `dev_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function authHeader(accountSid: string, authToken: string): string {
  // Twilio uses HTTP Basic auth with the Account SID as the username
  // and the Auth Token as the password. Base64-encode "sid:token".
  const raw = `${accountSid}:${authToken}`;
  if (typeof Buffer !== "undefined") {
    return `Basic ${Buffer.from(raw, "utf-8").toString("base64")}`;
  }
  // Browser-safe fallback (Bun / Deno / workers).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b64 = (globalThis as { btoa?: (s: string) => string }).btoa;
  if (b64) return `Basic ${b64(raw)}`;
  return `Basic ${raw}`;
}

function normalisePhone(phone: string): string {
  if (!phone) throw new Error("sendSms: 'to' is required");
  const e164 = toE164(phone) ?? phone;
  if (!isValidE164(e164)) {
    throw new Error(`sendSms: invalid destination number "${phone}"`);
  }
  return e164;
}

export class TwilioClient {
  /**
   * Send a single outbound SMS via Twilio's REST API.
   *
   * Twilio's 201 response includes a JSON body with `sid`, `status`,
   * `to`, `from`, and `body`. On 4xx / 5xx we throw with the body's
   * `message` so the campaign step processor can persist it.
   */
  async sendSms(
    dealerSettings: unknown,
    input: SendSmsInput,
  ): Promise<SendSmsResult> {
    if (!input.body || input.body.length === 0) {
      throw new Error("sendSms: 'body' is required");
    }
    if (input.body.length > 1600) {
      // Twilio's hard limit is 1600 chars for a single SMS segment.
      throw new Error("sendSms: 'body' exceeds 1600 characters");
    }

    const to = normalisePhone(input.to);
    const creds = resolveCreds(dealerSettings);
    if (!creds) {
      return { messageSid: devMessageSid("tw"), dev: true };
    }
    const from = input.from ?? creds.fromNumber;

    const endpoint = `${API_BASE}/${API_VERSION}/Accounts/${creds.accountSid}/Messages.json`;

    const form = new URLSearchParams();
    form.set("To", to);
    form.set("From", from);
    form.set("Body", input.body);
    if (input.statusCallback) {
      form.set("StatusCallback", input.statusCallback);
    }
    for (const url of input.mediaUrls ?? []) {
      form.append("MediaUrl", url);
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authHeader(creds.accountSid, creds.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const payload = (await response.json()) as { message?: string; code?: number };
        detail = payload.message ?? `code ${payload.code ?? "?"}`;
      } catch {
        detail = await response.text().catch(() => "");
      }
      throw new Error(
        `Twilio send failed (${response.status}): ${detail || "unknown error"}`,
      );
    }

    const payload = (await response.json()) as { sid?: string };
    return {
      messageSid: payload.sid ?? devMessageSid("tw"),
      dev: false,
    };
  }
}

export const twilioClient = new TwilioClient();
