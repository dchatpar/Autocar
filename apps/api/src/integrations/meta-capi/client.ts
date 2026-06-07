/**
 * Meta Conversions API (CAPI) client.
 *
 * Server-side events that mirror the browser pixel. DealerOS uses
 * CAPI to:
 *   - attribute Meta Lead Ads → closed deals
 *   - back up the pixel when the customer has ad-blockers
 *
 * Endpoints:
 *   POST /{API_VERSION}/{pixel_id}/events
 *
 * Body shape (simplified):
 *   {
 *     data: [{
 *       event_name: "Lead",
 *       event_time: 1700000000,
 *       event_id: "<dedup key, matches pixel event_id>",
 *       action_source: "system_generated",
 *       user_data: { em: ["<sha256>"], ph: ["<sha256>"], ... },
 *       custom_data: { ... }
 *     }],
 *     access_token: "<long-lived token>"
 *   }
 *
 * In dev (no pixel configured), sendConversionEvent is a no-op so the
 * rest of the pipeline keeps moving.
 */

import { createHash } from "node:crypto";

import { envOr, resolveCredential } from "../shared/credentials.js";

const API_BASE = process.env.WHATSAPP_CLOUD_API_BASE ?? "https://graph.facebook.com";
const API_VERSION = envOr("WHATSAPP_API_VERSION", "v21.0");

export interface CapiUserData {
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  fbc?: string | null;
  fbp?: string | null;
}

export interface CapiCustomData {
  value?: number;
  currency?: string;
  contentName?: string;
  contentCategory?: string;
  contentIds?: string[];
  contentType?: string;
  numItems?: number;
  status?: string;
  leadId?: string;
  dealerId?: string;
}

export interface SendEventInput {
  eventName: string;
  leadId: string;
  dealerId: string;
  eventId?: string;
  eventTime?: number;
  userData?: CapiUserData;
  customData?: CapiCustomData;
  actionSource?:
    | "email"
    | "website"
    | "phone_call"
    | "chat"
    | "physical_store"
    | "system_generated"
    | "other";
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function normalizeUserData(u: CapiUserData | undefined): Record<string, string[]> {
  if (!u) return {};
  const out: Record<string, string[]> = {};
  if (u.email) out.em = [sha256(u.email)];
  if (u.phone) {
    // E.164 — strip non-digits except leading +
    const e164 = u.phone.replace(/[^\d+]/g, "");
    if (e164.length > 0) out.ph = [sha256(e164)];
  }
  if (u.externalId) out.external_id = [sha256(u.externalId)];
  if (u.firstName) out.fn = [sha256(u.firstName)];
  if (u.lastName) out.ln = [sha256(u.lastName)];
  if (u.city) out.ct = [sha256(u.city)];
  if (u.state) out.st = [sha256(u.state)];
  if (u.zip) out.zp = [sha256(u.zip)];
  if (u.country) out.country = [sha256(u.country)];
  if (u.clientIp) out.client_ip_address = [u.clientIp];
  if (u.userAgent) out.client_user_agent = [u.userAgent];
  if (u.fbc) out.fbc = [u.fbc];
  if (u.fbp) out.fbp = [u.fbp];
  return out;
}

function normalizeCustomData(c: CapiCustomData | undefined): Record<string, unknown> {
  if (!c) return {};
  const out: Record<string, unknown> = {};
  if (c.value !== undefined) out.value = c.value;
  if (c.currency) out.currency = c.currency;
  if (c.contentName) out.content_name = c.contentName;
  if (c.contentCategory) out.content_category = c.contentCategory;
  if (c.contentIds) out.content_ids = c.contentIds;
  if (c.contentType) out.content_type = c.contentType;
  if (c.numItems !== undefined) out.num_items = c.numItems;
  if (c.status) out.status = c.status;
  if (c.leadId) out.lead_id = c.leadId;
  if (c.dealerId) out.dealer_id = c.dealerId;
  return out;
}

export class MetaCapiClient {
  async sendConversionEvent(
    eventName: string,
    leadId: string,
    dealerId: string,
    customData?: CapiUserData & CapiCustomData,
  ): Promise<{ sent: boolean; dev: boolean; reason?: string }> {
    const pixelId = resolveCredential(
      undefined, // CAPI isn't per-dealer in v1 — global pixel.
      "META_CAPI_PIXEL_ID",
      "META_CAPI_PIXEL_ID",
    );
    const token = resolveCredential(
      undefined,
      "META_CAPI_ACCESS_TOKEN",
      "META_CAPI_ACCESS_TOKEN",
    );
    if (!pixelId.value || !token.value) {
      return { sent: false, dev: true, reason: "capi_not_configured" };
    }
    const url = `${API_BASE}/${API_VERSION}/${pixelId.value}/events`;
    const event = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: `${dealerId}:${leadId}:${eventName}:${Math.floor(Date.now() / 1000)}`,
      action_source: "system_generated",
      user_data: normalizeUserData(customData),
      custom_data: normalizeCustomData(customData),
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event], access_token: token.value }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { sent: false, dev: false, reason: errText.slice(0, 256) };
    }
    return { sent: true, dev: false };
  }
}

export const metaCapiClient = new MetaCapiClient();
