/**
 * NOVA stub service — orchestrates the agent and persists telemetry.
 *
 * Called by:
 *   - /webhooks/meta/leads  (after a lead is created)
 *   - /webhooks/whatsapp    (after an inbound message is logged)
 *
 * Always returns within Meta's 5s budget for webhooks. Real outbound
 * calls happen in the foreground; if they hang, the webhook still
 * gets a 200 (fire-and-forget behaviour documented for Phase 2).
 */

import type { Dealer, Lead } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { whatsAppClient } from "../integrations/whatsapp/client.js";
import { metaCapiClient } from "../integrations/meta-capi/client.js";
import {
  novaAgent,
  buildFirstTouchBody,
  describeVehicle,
  pickChannel,
  type NovaChannel,
  type NovaOutput,
} from "../agents/nova.agent.js";

export interface RunNovaOptions {
  /** Skip sending the actual message (e.g. test mode). */
  dryRun?: boolean;
}

async function sendOutbound(
  channel: NovaChannel,
  toE164: string | null,
  body: string,
  dealerId: string,
  dealerSettings: unknown,
): Promise<{ messageId: string; dev: boolean }> {
  if (channel === "whatsapp") {
    if (!toE164) return { messageId: "", dev: true };
    const res = await whatsAppClient.sendTextMessage(
      toE164,
      body,
      dealerId,
      dealerSettings,
    );
    return { messageId: res.messageId, dev: res.dev };
  }
  // SMS / email paths are stubbed in Phase 1.
  return { messageId: `dev_${channel}`, dev: true };
}

export const novaService = {
  /**
   * Run NOVA for a lead and persist the AgentRun row. Returns the
   * NovaOutput for the caller to log or act on.
   */
  async run(
    lead: Lead,
    dealer: Dealer,
    options: RunNovaOptions = {},
  ): Promise<NovaOutput> {
    const start = Date.now();
    const dealerSettings = dealer.settings;

    const channel = options.dryRun ? "none" : pickChannel(lead, dealer);
    const vehicle = describeVehicle(lead.vehicleInterest);
    const body = buildFirstTouchBody(lead.firstName, dealer.name, vehicle);

    let messageId = "";
    let dev = true;
    let sendError: string | null = null;
    if (channel !== "none" && !options.dryRun) {
      try {
        const res = await sendOutbound(
          channel,
          lead.phone,
          body,
          dealer.id,
          dealerSettings,
        );
        messageId = res.messageId;
        dev = res.dev;
      } catch (err) {
        sendError = err instanceof Error ? err.message : String(err);
      }
    }

    const durationMs = Date.now() - start;
    const status = sendError ? "failed" : "success";

    // Persist AgentRun. Fire-and-forget — webhook must return 200 fast.
    let runId = `local_${Date.now().toString(36)}`;
    try {
      const row = await prisma.agentRun.create({
        data: {
          dealerId: dealer.id,
          agentName: novaAgent.name,
          entityType: "LEAD",
          entityId: lead.id,
          input: {
            leadId: lead.id,
            source: lead.source,
            phone: lead.phone,
            email: lead.email,
            firstName: lead.firstName,
          },
          output: {
            channel,
            messageId,
            body,
            vehicle,
            dev,
            error: sendError,
          },
          durationMs,
          status,
        },
        select: { id: true },
      });
      runId = row.id;
    } catch (err) {
      // Logging only — never block the webhook.
      // eslint-disable-next-line no-console
      console.error("[nova] failed to persist agent_run:", err);
    }

    // Fire CAPI event in the background. Don't await.
    void metaCapiClient
      .sendConversionEvent("Lead", lead.id, dealer.id, {
        email: lead.email,
        phone: lead.phone,
        firstName: lead.firstName,
        lastName: lead.lastName,
        contentName: vehicle ?? undefined,
        status: "new",
        leadId: lead.id,
        dealerId: dealer.id,
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[nova] capi send failed:", err);
      });

    return {
      runId,
      channel,
      messageId: messageId || null,
      body,
      dev,
      vehicle,
      durationMs,
    };
  },
};

export default novaService;
