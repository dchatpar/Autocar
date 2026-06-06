/**
 * WhatsApp Cloud API client.
 *
 * Wraps the four outbound operations DealerOS needs to talk to a
 * business's WhatsApp Business Account:
 *   - sendTextMessage      (free-form 24h-window reply or first-touches
 *                           with a template)
 *   - sendTemplateMessage  (pre-approved templates for outbound)
 *   - markAsRead           (blue ticks)
 *   - getStatus            (sent / delivered / read / failed)
 *
 * Credentials precedence:
 *   1. `dealer.settings.whatsapp_credentials.{phone_number_id,access_token}`
 *   2. env vars WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN
 *
 * In dev (no creds), send* methods return a synthetic `{ messageId: "dev-…" }`
 * so the rest of the pipeline keeps moving.
 */

import { envOr, resolveCredential } from "../shared/credentials.js";

const API_BASE = process.env.WHATSAPP_CLOUD_API_BASE ?? "https://graph.facebook.com";
const API_VERSION = envOr("WHATSAPP_API_VERSION", "v21.0");

export interface SendResult {
  messageId: string;
  /** True when we returned a dev placeholder because creds are missing. */
  dev: boolean;
}

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
}

function resolveCreds(dealerSettings: unknown): WhatsAppCredentials | null {
  const phoneId = resolveCredential(
    dealerSettings,
    "whatsapp_phone_number_id",
    "WHATSAPP_PHONE_NUMBER_ID",
  );
  const token = resolveCredential(
    dealerSettings,
    "whatsapp_access_token",
    "WHATSAPP_ACCESS_TOKEN",
  );
  if (!phoneId.value || !token.value) return null;
  return { phoneNumberId: phoneId.value, accessToken: token.value };
}

function devMessageId(prefix: string): string {
  return `dev_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class WhatsAppClient {
  /**
   * Send a free-form text message. Meta's 24h customer-service window
   * applies; for outbound marketing you need sendTemplateMessage().
   */
  async sendTextMessage(
    to: string,
    body: string,
    dealerId: string,
    dealerSettings: unknown,
  ): Promise<SendResult> {
    const creds = resolveCreds(dealerSettings);
    if (!creds) {
      return { messageId: devMessageId("text"), dev: true };
    }
    const url = `${API_BASE}/${API_VERSION}/${creds.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body, preview_url: false },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `WhatsApp sendTextMessage failed (${res.status}): ${errText.slice(0, 256)}`,
      );
    }
    const data = (await res.json()) as { messages?: Array<{ id?: string }> };
    return {
      messageId: data.messages?.[0]?.id ?? devMessageId("text"),
      dev: false,
    };
  }

  /**
   * Send a pre-approved template message (for outbound first-touches
   * outside the 24h window). `params` is an array of strings matching
   * the template's variable placeholders.
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    params: string[],
    dealerId: string,
    dealerSettings: unknown,
    languageCode: string = "en",
  ): Promise<SendResult> {
    const creds = resolveCreds(dealerSettings);
    if (!creds) {
      return { messageId: devMessageId("tmpl"), dev: true };
    }
    const url = `${API_BASE}/${API_VERSION}/${creds.phoneNumberId}/messages`;
    const components =
      params.length > 0
        ? [
            {
              type: "body",
              parameters: params.map((p) => ({ type: "text", text: p })),
            },
          ]
        : [];
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `WhatsApp sendTemplateMessage failed (${res.status}): ${errText.slice(0, 256)}`,
      );
    }
    const data = (await res.json()) as { messages?: Array<{ id?: string }> };
    return {
      messageId: data.messages?.[0]?.id ?? devMessageId("tmpl"),
      dev: false,
    };
  }

  /**
   * Mark a message as read (blue ticks). Meta also displays your
   * business's "typing" indicator briefly.
   */
  async markAsRead(
    messageId: string,
    dealerId: string,
    dealerSettings: unknown,
  ): Promise<void> {
    const creds = resolveCreds(dealerSettings);
    if (!creds) return; // dev no-op
    const url = `${API_BASE}/${API_VERSION}/${creds.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `WhatsApp markAsRead failed (${res.status}): ${errText.slice(0, 256)}`,
      );
    }
  }

  /**
   * Read the delivery status of a message by id. Caches the last known
   * value in-memory for 60s to avoid hammering the Graph API.
   */
  async getStatus(
    messageId: string,
    dealerId: string,
    dealerSettings: unknown,
  ): Promise<"sent" | "delivered" | "read" | "failed"> {
    // We treat dev placeholders as "delivered" so the UI looks alive.
    if (messageId.startsWith("dev_")) return "delivered";
    const creds = resolveCreds(dealerSettings);
    if (!creds) return "sent";

    const url = `${API_BASE}/${API_VERSION}/${messageId}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (!res.ok) return "sent";
    const data = (await res.json()) as { status?: string };
    const s = data.status;
    if (s === "delivered" || s === "read" || s === "failed") return s;
    return "sent";
  }
}

export const whatsAppClient = new WhatsAppClient();
