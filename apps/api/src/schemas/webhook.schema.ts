/**
 * Zod schemas for inbound webhooks (Meta Lead Ads, WhatsApp Cloud API).
 *
 * Meta's payload shapes are stable but permissive — we keep the
 * schemas deliberately loose (z.string(), z.record()) for fields we
 * don't strictly need, and tight for fields we DO need (leadgen_id,
 * entry[*].changes[*].value.messages[*].from, etc).
 */

import { z } from "zod";

/* ============================================================
 * Meta Lead Ads — POST /webhooks/meta/leads
 * Reference: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/webhooks
 * ============================================================ */

export const MetaFieldDataSchema = z
  .object({
    name: z.string(),
    values: z.array(z.string()).min(1),
  })
  .passthrough();

export const MetaLeadDataSchema = z
  .object({
    id: z.string(), // leadgen_id
    created_time: z.string().optional(),
    ad_id: z.string().optional(),
    adset_id: z.string().optional(),
    campaign_id: z.string().optional(),
    form_id: z.string().optional(),
    page_id: z.string().optional(),
    field_data: z.array(MetaFieldDataSchema).default([]),
  })
  .passthrough();

export const MetaChangeValueSchema = z
  .object({
    leadgen_id: z.string().optional(),
    page_id: z.string().optional(),
    form_id: z.string().optional(),
    ad_id: z.string().optional(),
    adset_id: z.string().optional(),
    campaign_id: z.string().optional(),
    created_time: z.union([z.string(), z.number()]).optional(),
    field_data: z.array(MetaFieldDataSchema).optional(),
    // Also accept a fully-embedded lead_data object
    lead_data: MetaLeadDataSchema.optional(),
  })
  .passthrough();

export const MetaChangeSchema = z
  .object({
    field: z.string().optional(),
    value: MetaChangeValueSchema.optional(),
  })
  .passthrough();

export const MetaEntrySchema = z
  .object({
    id: z.string().optional(), // page id
    time: z.number().optional(),
    changes: z.array(MetaChangeSchema).default([]),
  })
  .passthrough();

export const MetaLeadsPayloadSchema = z
  .object({
    object: z.string().optional(),
    entry: z.array(MetaEntrySchema).default([]),
  })
  .passthrough();
export type MetaLeadsPayload = z.infer<typeof MetaLeadsPayloadSchema>;

/* ============================================================
 * Meta verification handshake — GET /webhooks/meta/leads
 * ============================================================ */

export const MetaVerifyQuerySchema = z.object({
  "hub.mode": z.literal("subscribe"),
  "hub.verify_token": z.string().min(1),
  "hub.challenge": z.string().min(1),
});
export type MetaVerifyQuery = z.infer<typeof MetaVerifyQuerySchema>;

/* ============================================================
 * WhatsApp Cloud API — POST /webhooks/whatsapp
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 * ============================================================ */

export const WhatsAppTextSchema = z
  .object({
    body: z.string(),
  })
  .passthrough();

export const WhatsAppInteractiveSchema = z
  .object({
    type: z.string().optional(),
  })
  .passthrough();

export const WhatsAppMessageSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    timestamp: z.string(),
    type: z.string(), // "text" | "image" | "button" | "interactive" | ...
    text: WhatsAppTextSchema.optional(),
    interactive: WhatsAppInteractiveSchema.optional(),
    // Context (reply-to) — wamid of the previous outbound message
    context: z
      .object({
        from: z.string().optional(),
        id: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const WhatsAppContactSchema = z
  .object({
    profile: z.object({ name: z.string().optional() }).passthrough().optional(),
    wa_id: z.string().optional(),
  })
  .passthrough();

export const WhatsAppMetadataSchema = z
  .object({
    display_phone_number: z.string().optional(),
    phone_number_id: z.string().optional(),
  })
  .passthrough();

export const WhatsAppStatusSchema = z
  .object({
    id: z.string(), // wamid
    status: z.enum(["sent", "delivered", "read", "failed"]),
    timestamp: z.string(),
    recipient_id: z.string().optional(),
    errors: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

export const WhatsAppValueSchema = z
  .object({
    messaging_product: z.string().optional(),
    metadata: WhatsAppMetadataSchema.optional(),
    contacts: z.array(WhatsAppContactSchema).optional(),
    messages: z.array(WhatsAppMessageSchema).optional(),
    statuses: z.array(WhatsAppStatusSchema).optional(),
    errors: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

export const WhatsAppChangeSchema = z
  .object({
    field: z.string().optional(),
    value: WhatsAppValueSchema.optional(),
  })
  .passthrough();

export const WhatsAppEntrySchema = z
  .object({
    id: z.string().optional(),
    changes: z.array(WhatsAppChangeSchema).default([]),
  })
  .passthrough();

export const WhatsAppPayloadSchema = z
  .object({
    object: z.string().optional(),
    entry: z.array(WhatsAppEntrySchema).default([]),
  })
  .passthrough();
export type WhatsAppPayload = z.infer<typeof WhatsAppPayloadSchema>;

/* ============================================================
 * WhatsApp verification handshake — GET /webhooks/whatsapp
 * ============================================================ */

export const WhatsAppVerifyQuerySchema = z.object({
  "hub.mode": z.literal("subscribe"),
  "hub.verify_token": z.string().min(1),
  "hub.challenge": z.string().min(1),
});
export type WhatsAppVerifyQuery = z.infer<typeof WhatsAppVerifyQuerySchema>;
