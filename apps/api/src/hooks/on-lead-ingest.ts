/**
 * on-lead-ingest — fire-and-forget duplicate check after a new lead
 * is ingested (Meta Lead Ads webhook, WhatsApp webhook, manual entry,
 * CSV import, etc.).
 *
 * We compare the new lead against existing CUSTOMERS in the same
 * dealer (not other leads — the rule is: a lead probably represents
 * an existing customer; merge them on conversion, or call attention
 * to the duplicate at the lead stage).
 *
 * The hook:
 *   1. Runs the detector against the dealer.
 *   2. Persists a `DuplicateDetectionLog` row per auto_merge / flag
 *      match (entityType=lead, entityAId=leadId, entityBId=customerId).
 *   3. Logs a structured event for observability.
 *
 * Never throws into the request path.
 */

import type { FastifyBaseLogger } from "fastify";
import type { Lead } from "@prisma/client";

import { duplicateDetector } from "../services/duplicate-detector.service.js";
import { logger } from "../utils/logger.js";

export interface OnLeadIngestOptions {
  lead: Lead;
  logger?: FastifyBaseLogger;
}

export interface OnLeadIngestResult {
  matchCount: number;
  topMatch: { id: string; score: number; classification: string } | null;
  persistedLogIds: string[];
}

export async function onLeadIngest(
  options: OnLeadIngestOptions,
): Promise<OnLeadIngestResult> {
  const log = options.logger ?? {
    warn: (...args: unknown[]) => logger.warn("dup-hook", ...args),
    error: (...args: unknown[]) => logger.error("dup-hook", ...args),
    info: (...args: unknown[]) => logger.info("dup-hook", ...args),
    debug: () => {},
    trace: () => {},
    fatal: (...args: unknown[]) => logger.error("dup-hook", ...args),
    level: "info",
    silent: false,
    child() {
      return this;
    },
  } as unknown as FastifyBaseLogger;

  try {
    const result = await duplicateDetector.findDuplicatesForLead(
      options.lead,
      {},
    );
    if (result.matches.length === 0) {
      return { matchCount: 0, topMatch: null, persistedLogIds: [] };
    }

    const persistedLogIds: string[] = [];
    for (const m of result.matches) {
      if (m.classification === "not_duplicate") continue;
      const row = await duplicateDetector.logDuplicate({
        dealerId: options.lead.dealerId,
        entityType: "lead",
        entityAId: options.lead.id,
        entityBId: m.customer.id,
        score: m.score,
        reasons: m.reasons,
        classification: m.classification,
      });
      persistedLogIds.push(row.id);
    }

    const top = result.matches[0];
    const topMatch: OnLeadIngestResult["topMatch"] = top
      ? {
          id: top.customer.id,
          score: top.score,
          classification: top.classification,
        }
      : null;

    log.info(
      {
        leadId: options.lead.id,
        matchCount: result.matches.length,
        topScore: top?.score ?? 0,
        topClassification: top?.classification ?? "none",
        durationMs: result.durationMs,
      },
      "onLeadIngest: potential customer duplicates found",
    );

    return { matchCount: result.matches.length, topMatch, persistedLogIds };
  } catch (err) {
    log.error(
      { err, leadId: options.lead.id },
      "onLeadIngest: detector failed (non-blocking)",
    );
    return { matchCount: 0, topMatch: null, persistedLogIds: [] };
  }
}

export function fireAndForget(options: OnLeadIngestOptions): void {
  void onLeadIngest(options).catch(() => {
    // logged inside
  });
}
