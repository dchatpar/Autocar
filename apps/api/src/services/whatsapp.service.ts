/**
 * WhatsApp Service — WhatsApp Cloud API integration.
 *
 * Features:
 *   - Send outbound messages via WhatsApp Cloud API
 *   - Template message support
 *   - Handle incoming webhooks
 *   - Store message history
 */

import type { Communication, CommunicationChannel, CommunicationDirection, CommunicationStatus } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { toE164 } from "../utils/phone.js";
import { NotFoundError } from "../utils/errors.js";

/* ============================================================
 * Types
 * ============================================================ */

export interface WhatsAppMessage {
  to: string;
  body: string;
  templateName?: string;
  templateVariables?: Record<string, string>;
  mediaUrl?: string;
}

export interface OutboundResult {
  messageId: string;
  status: string;
  timestamp: string;
}

export interface IncomingMessage {
  from: string;
  body: string;
  timestamp: string;
  messageId: string;
  type: string;
  mediaUrl?: string;
}

/* ============================================================
 * WhatsApp Cloud API client
 * ============================================================ */

async function callWhatsAppAPI(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp API credentials not configured");
  }

  const baseUrl = "https://graph.facebook.com/v18.0";
  const url = `${baseUrl}/${phoneNumberId}/${endpoint}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

/* ============================================================
 * Send message
 * ============================================================ */

export async function sendMessage(
  dealerId: string,
  to: string,
  message: WhatsAppMessage,
): Promise<OutboundResult> {
  // Convert phone to E.164 format
  const e164Phone = toE164(to);
  if (!e164Phone) {
    throw new Error("Invalid phone number format");
  }

  let payload: Record<string, unknown>;

  if (message.templateName) {
    // Template message
    payload = {
      messaging_product: "whatsapp",
      to: e164Phone,
      type: "template",
      template: {
        name: message.templateName,
        language: { code: "en_US" },
        components: message.templateVariables
          ? [
              {
                type: "body",
                parameters: Object.entries(message.templateVariables).map(
                  ([key, value]) => ({
                    type: "text",
                    text: value,
                  }),
                ),
              },
            ]
          : undefined,
      },
    };
  } else if (message.mediaUrl) {
    // Media message
    payload = {
      messaging_product: "whatsapp",
      to: e164Phone,
      type: "image",
      image: { link: message.mediaUrl },
    };
  } else {
    // Text message
    payload = {
      messaging_product: "whatsapp",
      to: e164Phone,
      type: "text",
      text: { body: message.body },
    };
  }

  const result = await callWhatsAppAPI("messages", payload);

  // Store communication record
  const msgId = (result.messages as Array<{ id: string }>)?.[0]?.id ?? "unknown";

  await prisma.communication.create({
    data: {
      dealerId,
      channel: "WHATSAPP",
      direction: "OUTBOUND",
      fromAddr: process.env.WHATSAPP_PHONE_NUMBER ?? null,
      toAddr: e164Phone,
      body: message.templateName ? `[Template: ${message.templateName}] ${message.body}` : message.body,
      status: "SENT",
      externalId: msgId,
    },
  });

  return {
    messageId: msgId,
    status: "sent",
    timestamp: new Date().toISOString(),
  };
}

/* ============================================================
 * Send template message
 * ============================================================ */

export async function sendTemplateMessage(
  dealerId: string,
  to: string,
  templateName: string,
  variables?: Record<string, string>,
): Promise<OutboundResult> {
  return sendMessage(dealerId, to, {
    to,
    body: "",
    templateName,
    templateVariables: variables,
  });
}

/* ============================================================
 * Send quick reply
 * ============================================================ */

export async function sendQuickReply(
  dealerId: string,
  to: string,
  body: string,
  buttons: string[],
): Promise<OutboundResult> {
  const e164Phone = toE164(to);
  if (!e164Phone) {
    throw new Error("Invalid phone number format");
  }

  const payload = {
    messaging_product: "whatsapp",
    to: e164Phone,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map((btn, idx) => ({
          type: "reply",
          reply: { id: `btn_${idx}`, title: btn.slice(0, 25) },
        })),
      },
    },
  };

  const result = await callWhatsAppAPI("messages", payload);
  const msgId = (result.messages as Array<{ id: string }>)?.[0]?.id ?? "unknown";

  await prisma.communication.create({
    data: {
      dealerId,
      channel: "WHATSAPP",
      direction: "OUTBOUND",
      fromAddr: process.env.WHATSAPP_PHONE_NUMBER ?? null,
      toAddr: e164Phone,
      body,
      status: "SENT",
      externalId: msgId,
    },
  });

  return {
    messageId: msgId,
    status: "sent",
    timestamp: new Date().toISOString(),
  };
}

/* ============================================================
 * Process incoming webhook
 * ============================================================ */

export async function processIncomingMessage(
  dealerId: string,
  message: IncomingMessage,
  leadId?: string,
  customerId?: string,
): Promise<Communication> {
  const communication = await prisma.communication.create({
    data: {
      dealerId,
      leadId: leadId ?? null,
      customerId: customerId ?? null,
      channel: "WHATSAPP",
      direction: "INBOUND",
      fromAddr: message.from,
      toAddr: process.env.WHATSAPP_PHONE_NUMBER ?? null,
      body: message.body,
      status: "DELIVERED",
      externalId: message.messageId,
      sentAt: new Date(message.timestamp),
    },
  });

  return communication;
}

/* ============================================================
 * Mark message as read
 * ============================================================ */

export async function markAsRead(messageId: string): Promise<void> {
  const payload = {
    messaging_product: "whatsapp",
    to: messageId,
  };

  await callWhatsAppAPI("messages", { ...payload, action: "mark_seen" });
}

/* ============================================================
 * Get message status
 * ============================================================ */

export async function getMessageStatus(
  messageId: string,
): Promise<CommunicationStatus> {
  // In production, you'd call the WhatsApp API to get the status
  // For now, return the stored status
  const communication = await prisma.communication.findFirst({
    where: { externalId: messageId },
  });

  return communication?.status ?? "SENT";
}

/* ============================================================
 * Get conversation history
 * ============================================================ */

export async function getConversationHistory(
  dealerId: string,
  phone: string,
  limit = 50,
): Promise<Communication[]> {
  const e164Phone = toE164(phone);
  if (!e164Phone) {
    throw new NotFoundError("Invalid phone number");
  }

  return prisma.communication.findMany({
    where: {
      dealerId,
      channel: "WHATSAPP",
      OR: [{ fromAddr: e164Phone }, { toAddr: e164Phone }],
    },
    orderBy: { sentAt: "desc" },
    take: limit,
  });
}

/* ============================================================
 * Template management
 * ============================================================ */

export const WHATSAPP_TEMPLATES = {
  LEAD_FOLLOW_UP: {
    name: "lead_follow_up",
    variables: ["firstName", "agentName", " dealershipName"],
  },
  APPOINTMENT_REMINDER: {
    name: "appointment_reminder",
    variables: ["customerName", "date", "time", "location"],
  },
  TEST_DRIVE_CONFIRMATION: {
    name: "test_drive_confirmation",
    variables: ["customerName", "vehicleName", "date", "time"],
  },
  DEAL_UPDATE: {
    name: "deal_update",
    variables: ["customerName", "status", "nextSteps"],
  },
  WELCOME: {
    name: "welcome_message",
    variables: ["firstName", "dealershipName"],
  },
};

export const whatsappService = {
  sendMessage,
  sendTemplateMessage,
  sendQuickReply,
  processIncomingMessage,
  markAsRead,
  getMessageStatus,
  getConversationHistory,
  templates: WHATSAPP_TEMPLATES,
};

export default whatsappService;
