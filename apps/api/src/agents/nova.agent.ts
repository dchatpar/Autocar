/**
 * NOVA — first-touch AI agent.
 *
 * Phase 1 stub: real LangGraph wiring is in Phase 2. This file defines
 * the input/output contract that the orchestrator will rely on, so the
 * webhook handlers can call it today and we won't have to rewrite them
 * when the LLM-backed version lands.
 *
 * Responsibilities (Phase 1):
 *   1. Pick a channel based on lead.source + available contact info
 *   2. Build a CASL/PIPEDA-compliant first-touch message
 *   3. Send via WhatsApp Cloud API (real call when creds exist,
 *      dev-placeholder otherwise)
 *   4. Persist an AgentRun row with input, output, status, durationMs
 *
 * CASL/PIPEDA compliance notes:
 *   - First-touches are transactional (lead inquiry → follow-up), so
 *     an unsubscribe link is NOT required under CASL s. 6(2). We
 *     still include a clear sender identity + opt-out language in
 *     the message body ("Reply STOP to opt out").
 *   - We never auto-send marketing to a contact who has not initiated
 *     the relationship.
 */

import type { Dealer, Lead } from "@prisma/client";
import { whatsAppClient } from "../integrations/whatsapp/client.js";

export type NovaChannel = "whatsapp" | "sms" | "email" | "none";

export interface NovaInput {
  lead: Lead;
  dealer: Dealer;
  /** Override the channel selection (e.g. force "whatsapp" in tests). */
  forceChannel?: NovaChannel;
}

export interface NovaOutput {
  runId: string;
  channel: NovaChannel;
  messageId: string | null;
  body: string;
  dev: boolean;
  /** Vehicle label surfaced in the message, if any. */
  vehicle: string | null;
  durationMs: number;
}

export interface NovaVehicleInterest {
  make?: string;
  model?: string;
  year?: number;
  stockNumber?: string;
  title?: string;
}

/**
 * Pick the right channel for this lead.
 *
 * Rules (in order):
 *   1. click_to_whatsapp → WhatsApp (Meta is the originator)
 *   2. has phone (E.164)  → WhatsApp if WhatsApp creds configured,
 *                           else SMS-fallback (we log; Twilio later)
 *   3. email only         → email (logged, SMTP later)
 *   4. otherwise          → none (no contact, can't reach)
 */
export function pickChannel(lead: Lead, dealer: Dealer): NovaChannel {
  const source = (lead.source ?? "").toLowerCase();
  if (source === "click_to_whatsapp") return "whatsapp";

  if (lead.phone) {
    const settings = (dealer.settings ?? {}) as Record<string, unknown>;
    const hasWa =
      Boolean(settings.whatsapp_phone_number_id) ||
      Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
    if (hasWa) return "whatsapp";
    return "sms";
  }
  if (lead.email) return "email";
  return "none";
}

/**
 * Parse lead.vehicleInterest JSON into a friendly label.
 * The DB column is `Json` — typically a list of { make, model, year, stockNumber }
 * but may also be a string in legacy rows.
 */
export function describeVehicle(interest: unknown): string | null {
  if (!interest) return null;
  if (typeof interest === "string" && interest.trim().length > 0) {
    return interest.trim();
  }
  if (Array.isArray(interest)) {
    const first = interest[0];
    if (first && typeof first === "object") {
      const i = first as NovaVehicleInterest;
      if (i.title) return i.title;
      const parts = [i.year, i.make, i.model].filter((v) => typeof v !== "undefined" && v !== null);
      if (parts.length > 0) return parts.map(String).join(" ");
    }
    if (typeof first === "string") return first;
  }
  if (typeof interest === "object") {
    const i = interest as NovaVehicleInterest;
    if (i.title) return i.title;
    const parts = [i.year, i.make, i.model].filter((v) => typeof v !== "undefined" && v !== null);
    if (parts.length > 0) return parts.map(String).join(" ");
  }
  return null;
}

/**
 * Build the first-touch message body.
 *
 * Template:
 *   "Hi {firstName}, this is {dealerName}. Thanks for your interest in
 *    {vehicleOrGeneric}. When works for a quick chat — today, tomorrow,
 *    or later this week? Reply STOP to opt out."
 */
export function buildFirstTouchBody(
  firstName: string,
  dealerName: string,
  vehicle: string | null,
): string {
  const subject = vehicle ?? "one of our vehicles";
  return `Hi ${firstName}, this is ${dealerName}. Thanks for your interest in ${subject}. When works for a quick chat — today, tomorrow, or later this week? Reply STOP to opt out.`;
}

export const novaAgent = {
  name: "NOVA",
  version: "0.1.0-stub",
  pickChannel,
  describeVehicle,
  buildFirstTouchBody,
};

export default novaAgent;
