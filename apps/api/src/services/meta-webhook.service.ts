/**
 * Meta Webhook Service — processes Meta Lead Ads webhooks.
 *
 * Flow:
 *   1. Receive webhook payload from Meta
 *   2. Parse and validate the lead data
 *   3. Create Lead with source='meta_lead_ad'
 *   4. Trigger the AI routing engine
 *   5. Log the routing decision
 *   6. Emit real-time notifications
 */

import type { Dealer, Lead, Prisma } from "@prisma/client";

import { prisma } from "../utils/prisma.js";
import { toE164 } from "../utils/phone.js";
import { routingService } from "./routing.service.js";
import { NotFoundError } from "../utils/errors.js";
import type { DealerRoutingSettings } from "../schemas/lead-router.schema.js";

/* ============================================================
 * Types
 * ============================================================ */

export interface NormalizedMetaLead {
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
}

export interface ProcessResult {
  success: boolean;
  leadId?: string;
  assignedTo?: string | null;
  strategy?: string;
  reason?: string;
  error?: string;
}

/* ============================================================
 * Helpers
 * ============================================================ */

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function extractField(
  fieldData: Array<{ name: string; values: string[] }>,
  name: string,
): string {
  for (const f of fieldData) {
    if (f.name.toLowerCase() === name.toLowerCase()) {
      return f.values[0] ?? "";
    }
  }
  return "";
}

/* ============================================================
 * Lead normalization
 * ============================================================ */

export function normalizeMetaChange(
  entry: { id?: string; time?: number },
  change: { value?: Record<string, unknown> | undefined },
): NormalizedMetaLead | null {
  const v = change.value;
  if (!v) return null;

  const leadgenId =
    asString(v.leadgen_id) ||
    asString((v.lead_data as { id?: unknown } | undefined)?.id);
  if (!leadgenId) return null;

  const pageId = entry.id ?? asString(v.page_id) ?? null;
  const formId = asString(v.form_id) || null;
  const adId = asString(v.ad_id) || null;
  const adsetId = asString(v.adset_id) || null;
  const campaignId = asString(v.campaign_id) || null;

  // Extract field data
  let fieldData: Array<{ name: string; values: string[] }> = [];
  if (Array.isArray(v.field_data)) {
    fieldData = v.field_data as Array<{ name: string; values: string[] }>;
  } else {
    const embedded = v.lead_data as { field_data?: unknown } | undefined;
    if (embedded && Array.isArray(embedded.field_data)) {
      fieldData = embedded.field_data as Array<{ name: string; values: string[] }>;
    }
  }

  // Extract names
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
  if (!firstName) firstName = extractField(fieldData, "name") || "Unknown";

  const email = extractField(fieldData, "email") || null;
  const phoneRaw =
    extractField(fieldData, "phone_number") || extractField(fieldData, "phone");
  const phone = phoneRaw ? toE164(phoneRaw) : null;
  const vehicleInterest =
    extractField(fieldData, "interested_vehicle") ||
    extractField(fieldData, "vehicle") ||
    extractField(fieldData, "vehicle_interest") ||
    null;

  const formIdStr = formId ?? "";
  const source: "meta_lead_ad" | "click_to_whatsapp" =
    formIdStr.startsWith("wa_") ||
    (typeof v.lead_source === "string" &&
      v.lead_source === "click_to_whatsapp")
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
  };
}

/* ============================================================
 * Dealer resolution
 * ============================================================ */

export async function resolveDealer(
  pageId: string | null,
): Promise<Dealer | null> {
  // Try to find by meta_page_id in settings
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

  // Fallback to default dealer (dev mode)
  const fallback = await prisma.dealer.findFirst({
    where: {
      settings: {
        path: ["default_dealer_id"],
        equals: "true",
      },
    },
  });
  if (fallback) return fallback;

  // Last resort: any dealer
  return prisma.dealer.findFirst({ orderBy: { createdAt: "asc" } });
}

/* ============================================================
 * Duplicate detection
 * ============================================================ */

export async function findExistingLead(
  dealerId: string,
  leadgenId: string,
): Promise<Lead | null> {
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

/* ============================================================
 * Main processing
 * ============================================================ */

export async function processMetaLead(
  normalized: NormalizedMetaLead,
): Promise<ProcessResult> {
  try {
    // Resolve dealer
    const dealer = await resolveDealer(normalized.pageId);
    if (!dealer) {
      return { success: false, error: "No dealer found for page" };
    }

    // Check for duplicate
    const existing = await findExistingLead(dealer.id, normalized.leadgenId);
    if (existing) {
      return {
        success: true,
        leadId: existing.id,
        assignedTo: existing.assignedToId,
        strategy: "duplicate",
        reason: "Lead already exists (deduped)",
      };
    }

    // Build lead input
    const leadInput: Lead = {
      id: "pending",
      dealerId: dealer.id,
      source: normalized.source,
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
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      email: normalized.email,
      phone: normalized.phone,
      vehicleInterest: normalized.vehicleInterest
        ? ([{ title: normalized.vehicleInterest }] as unknown as Prisma.JsonArray)
        : ([] as unknown as Prisma.JsonArray),
      sourceMeta: normalized.sourceMeta as unknown as Prisma.JsonObject,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Route the lead
    const decision = await routingService.routeLead({
      lead: leadInput,
      dealer,
    });

    // Create lead + log in transaction
    const created = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          dealerId: dealer.id,
          source: normalized.source,
          status: "NEW",
          score: 50,
          firstName: normalized.firstName,
          lastName: normalized.lastName,
          email: normalized.email,
          phone: normalized.phone,
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
          body: `Routed via ${decision.strategy}: ${decision.reason}`,
          agentName: "ROUTER",
        },
      });

      return lead;
    });

    // Emit real-time notification
    await routingService.emitRoutingNotification(
      dealer.id,
      created.id,
      decision.assignedTo,
      decision.reason,
    );

    return {
      success: true,
      leadId: created.id,
      assignedTo: decision.assignedTo,
      strategy: decision.strategy,
      reason: decision.reason,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/* ============================================================
 * Batch processing
 * ============================================================ */

export async function processMetaWebhook(
  entries: Array<{
    id?: string;
    time?: number;
    changes: Array<{ value?: Record<string, unknown> }>;
  }>,
): Promise<{
  accepted: number;
  deduped: number;
  dropped: number;
  errors: Array<{ leadgenId: string; error: string }>;
}> {
  let accepted = 0;
  let deduped = 0;
  let dropped = 0;
  const errors: Array<{ leadgenId: string; error: string }> = [];

  for (const entry of entries) {
    for (const change of entry.changes) {
      if (!change.value) continue;

      const normalized = normalizeMetaChange(entry, change);
      if (!normalized) {
        dropped++;
        continue;
      }

      // Check for duplicate before processing
      const dealer = await resolveDealer(normalized.pageId);
      if (dealer) {
        const existing = await findExistingLead(dealer.id, normalized.leadgenId);
        if (existing) {
          deduped++;
          continue;
        }
      }

      const result = await processMetaLead(normalized);
      if (result.success) {
        accepted++;
      } else {
        errors.push({ leadgenId: normalized.leadgenId, error: result.error ?? "Unknown error" });
        dropped++;
      }
    }
  }

  return { accepted, deduped, dropped, errors };
}

export const metaWebhookService = {
  normalizeMetaChange,
  resolveDealer,
  findExistingLead,
  processMetaLead,
  processMetaWebhook,
};

export default metaWebhookService;
