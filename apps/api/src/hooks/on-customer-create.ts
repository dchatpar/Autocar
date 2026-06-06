/**
 * on-customer-create — fire-and-forget duplicate check after a new
 * customer is persisted.
 *
 * The caller has just inserted a Customer row. We:
 *   1. Run the duplicate detector against the dealer.
 *   2. Persist a `DuplicateDetectionLog` row per auto_merge / flag match.
 *   3. If anything was found, append a `note`-style activity on the
 *      new customer so the operator can see "possible duplicates
 *      detected" in the timeline.
 *
 * The hook is best-effort — it never throws into the request path.
 * Errors are logged via the provided `log` sink (Fastify request log
 * or a fallback `console`).
 */

import type { FastifyBaseLogger } from "fastify";
import type { Customer } from "@prisma/client";
import {
  duplicateDetector,
  type DuplicateMatch,
} from "../services/duplicate-detector.service.js";

export interface OnCustomerCreateOptions {
  customer: Customer;
  logger?: FastifyBaseLogger;
}

export interface OnCustomerCreateResult {
  matchCount: number;
  topMatch: { id: string; score: number; classification: string } | null;
  persistedLogIds: string[];
}

/**
 * Fire-and-forget wrapper. The caller is expected to `void` the
 * promise so the request response isn't blocked.
 */
export async function onCustomerCreate(
  options: OnCustomerCreateOptions,
): Promise<OnCustomerCreateResult> {
  const log = options.logger ?? {
    warn: (...args: unknown[]) => console.warn("[dup-hook]", ...args),
    error: (...args: unknown[]) => console.error("[dup-hook]", ...args),
    info: (...args: unknown[]) => console.info("[dup-hook]", ...args),
    debug: () => {},
    trace: () => {},
    fatal: (...args: unknown[]) => console.error("[dup-hook]", ...args),
    level: "info",
    silent: false,
    child() {
      return this;
    },
  } as unknown as FastifyBaseLogger;

  try {
    const result = await duplicateDetector.findDuplicatesForCustomer({
      id: options.customer.id,
      dealerId: options.customer.dealerId,
      firstName: options.customer.firstName,
      lastName: options.customer.lastName,
      email: options.customer.email,
      phone: options.customer.phone,
      address: options.customer.address,
    });

    if (result.matches.length === 0) {
      return { matchCount: 0, topMatch: null, persistedLogIds: [] };
    }

    const persistedLogIds: string[] = [];
    for (const m of result.matches) {
      if (m.classification === "not_duplicate") continue;
      const row = await duplicateDetector.logDuplicate({
        dealerId: options.customer.dealerId,
        entityType: "customer",
        entityAId: options.customer.id,
        entityBId: m.customer.id,
        score: m.score,
        reasons: m.reasons,
        classification: m.classification,
      });
      persistedLogIds.push(row.id);
    }

    const top = result.matches[0];
    const topMatch: OnCustomerCreateResult["topMatch"] = top
      ? {
          id: top.customer.id,
          score: top.score,
          classification: top.classification,
        }
      : null;

    log.info(
      {
        customerId: options.customer.id,
        matchCount: result.matches.length,
        topScore: top?.score ?? 0,
        topClassification: top?.classification ?? "none",
        candidatesScanned: result.candidatesScanned,
        durationMs: result.durationMs,
      },
      "onCustomerCreate: duplicates detected",
    );

    return { matchCount: result.matches.length, topMatch, persistedLogIds };
  } catch (err) {
    log.error(
      { err, customerId: options.customer.id },
      "onCustomerCreate: detector failed (non-blocking)",
    );
    return { matchCount: 0, topMatch: null, persistedLogIds: [] };
  }
}

/**
 * Helper: fire-and-forget by returning the unhandled promise. Use:
 *
 *   void onCustomerCreate({ customer: newRow });
 */
export function fireAndForget(
  options: OnCustomerCreateOptions,
): void {
  void onCustomerCreate(options).catch(() => {
    // already logged inside
  });
}

export type { DuplicateMatch };
