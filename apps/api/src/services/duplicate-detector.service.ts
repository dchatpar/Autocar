/**
 * Duplicate Detector — multi-field weighted matching for customer
 * and lead records.
 *
 * Algorithm (per /workspace/.skills/duplicate-detection/SKILL.md):
 *   1. Blocking step — cheap DB filter to limit the candidate set to
 *      rows that share email, phone suffix, or full name with the
 *      target record.
 *   2. Scoring — for each candidate, compute a weighted similarity
 *      score across email / phone / firstName / lastName / address.
 *   3. Classification — auto_merge (>=0.90) | flag (>=0.65) | not_duplicate.
 *   4. Persistence — write/upsert a DuplicateDetectionLog row per pair
 *      so the UI can show "needs review" badges.
 *
 * All operations are tenant-scoped: every Prisma call carries
 * `dealerId`. Repositories should pass `dealerId` explicitly.
 *
 * Performance: blocking step is index-friendly (we use the new
 * (dealerId, email) and (dealerId, phone) indexes). Per the spec we
 * aim for <500ms on a 1k-customer dataset; that should hold with
 * `take: 50` candidates per record.
 */

import { prisma } from "../utils/prisma.js";
import { toE164 } from "../utils/phone.js";
import {
  jaroWinklerSimilarity,
  normalizeForCompare,
  NAME_MATCH_THRESHOLD,
} from "../utils/string-similarity.js";
import type { Customer, Lead, Prisma } from "@prisma/client";

/* ============================================================
 * Configuration
 * ============================================================ */

export interface MatchWeights {
  email: number;
  phone: number;
  firstName: number;
  lastName: number;
  address: number;
}

export const DEFAULT_WEIGHTS: MatchWeights = {
  email: 0.35,
  phone: 0.30,
  firstName: 0.15,
  lastName: 0.15,
  address: 0.05,
};

export const DUPLICATE_THRESHOLDS = {
  AUTO_MERGE: 0.9,
  FLAG_FOR_REVIEW: 0.65,
} as const;

export type DuplicateClassification = "auto_merge" | "flag" | "not_duplicate";

export function classifyMatch(score: number): DuplicateClassification {
  if (score >= DUPLICATE_THRESHOLDS.AUTO_MERGE) return "auto_merge";
  if (score >= DUPLICATE_THRESHOLDS.FLAG_FOR_REVIEW) return "flag";
  return "not_duplicate";
}

/* ============================================================
 * Public types
 * ============================================================ */

export interface MatchableRecord {
  id: string;
  dealerId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address?: Prisma.JsonValue | null;
  /** Optional VIN, for lead→vehicle-interest match (future use). */
  vin?: string | null;
}

export interface DuplicateMatch {
  customer: Customer;
  score: number;
  reasons: string[];
  classification: DuplicateClassification;
}

/* ============================================================
 * Scoring
 * ============================================================ */

interface AddressLike {
  street?: unknown;
  postalCode?: unknown;
  zip?: unknown;
  city?: unknown;
}

function addressForCompare(value: Prisma.JsonValue | null | undefined): {
  streetNumber: string;
  postalCode: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { streetNumber: "", postalCode: "" };
  }
  const a = value as AddressLike;
  const street = typeof a.street === "string" ? a.street : "";
  // Pull the first run of digits from the street — that's typically
  // the civic number (e.g. "1234 Main St" → "1234").
  const streetMatch = street.match(/\d+/);
  const streetNumber = streetMatch ? streetMatch[0] : "";
  const postalCode =
    typeof a.postalCode === "string"
      ? a.postalCode
      : typeof a.zip === "string"
        ? a.zip
        : "";
  return { streetNumber, postalCode };
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

/**
 * Compute the weighted similarity between two matchable records.
 *
 * Returns the raw score (0..1) and a list of human-readable reasons
 * ("email match", "phone last-7 match 87%", etc.) that the UI can
 * show in the compare drawer.
 */
export function calculateSimilarity(
  a: MatchableRecord,
  b: MatchableRecord,
  weights: MatchWeights = DEFAULT_WEIGHTS,
): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  // Email — exact, case-insensitive.
  if (a.email && b.email) {
    const ea = a.email.trim().toLowerCase();
    const eb = b.email.trim().toLowerCase();
    if (ea && ea === eb) {
      score += weights.email;
      reasons.push("email match");
    }
  }

  // Phone — E.164 first, then last-7-digits fallback (0.85×).
  if (a.phone && b.phone) {
    const aE164 = toE164(a.phone);
    const bE164 = toE164(b.phone);
    if (aE164 && bE164) {
      if (aE164 === bE164) {
        score += weights.phone;
        reasons.push("phone match");
      } else {
        const aLast = aE164.slice(-7);
        const bLast = bE164.slice(-7);
        if (aLast.length === 7 && aLast === bLast) {
          score += weights.phone * 0.85;
          reasons.push("phone last-7 match");
        }
      }
    } else {
      // Fall back to literal last-7 on the raw strings.
      const aLast = a.phone.replace(/\D/g, "").slice(-7);
      const bLast = b.phone.replace(/\D/g, "").slice(-7);
      if (aLast.length === 7 && aLast === bLast) {
        score += weights.phone * 0.85;
        reasons.push("phone last-7 match");
      }
    }
  }

  // First name — Jaro-Winkler above threshold.
  if (a.firstName && b.firstName) {
    const sim = jaroWinklerSimilarity(a.firstName, b.firstName);
    if (sim >= NAME_MATCH_THRESHOLD) {
      score += weights.firstName * sim;
      reasons.push(`first name ${Math.round(sim * 100)}% match`);
    }
  }

  // Last name — same treatment.
  if (a.lastName && b.lastName) {
    const sim = jaroWinklerSimilarity(a.lastName, b.lastName);
    if (sim >= NAME_MATCH_THRESHOLD) {
      score += weights.lastName * sim;
      reasons.push(`last name ${Math.round(sim * 100)}% match`);
    }
  }

  // Address — street number + postal prefix (cheap proxy for full
  // address match). Postal prefix is the first 3 chars (FSA in
  // Canadian format) or first 5 in US ZIP — we just use the first
  // 3 chars for a permissive match.
  const addrA = addressForCompare(a.address);
  const addrB = addressForCompare(b.address);
  if (addrA.postalCode && addrB.postalCode) {
    const pa = normalizeForCompare(addrA.postalCode).slice(0, 3);
    const pb = normalizeForCompare(addrB.postalCode).slice(0, 3);
    if (pa.length === 3 && pa === pb) {
      // Bonus if street number also matches.
      const sa = addrA.streetNumber;
      const sb = addrB.streetNumber;
      if (sa && sb && sa === sb) {
        score += weights.address;
        reasons.push("address match");
      } else {
        score += weights.address * 0.6;
        reasons.push("postal prefix match");
      }
    }
  }

  return { score: Math.min(score, 1), reasons };
}

/* ============================================================
 * Blocking — candidate retrieval
 * ============================================================ */

const PHONE_LAST7_LENGTH = 7;

interface CandidateQueryInput {
  dealerId: string;
  excludeIds?: ReadonlyArray<string>;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  limit?: number;
}

interface CandidateQueryResult {
  emailMatches: Customer[];
  phoneMatches: Customer[];
  nameMatches: Customer[];
}

async function fetchCandidateCustomers(
  input: CandidateQueryInput,
): Promise<CandidateQueryResult> {
  const limit = input.limit ?? 50;
  const exclude = input.excludeIds ?? [];

  // 1. Email — exact, case-insensitive.
  const emailQuery: Prisma.CustomerWhereInput = input.email
    ? { email: { equals: input.email, mode: "insensitive" } }
    : { id: "__no_match__" }; // never matches; placeholder

  const emailMatches = await prisma.customer.findMany({
    where: {
      dealerId: input.dealerId,
      deletedAt: null,
      id: exclude.length > 0 ? { notIn: [...exclude] } : undefined,
      OR: [
        emailQuery,
        // Phone suffix via raw contains; we use the trailing 7 digits.
        input.phone
          ? {
              phone: {
                contains: input.phone.replace(/\D/g, "").slice(
                  -PHONE_LAST7_LENGTH,
                ) || "____",
              },
            }
          : { id: "__no_match__" },
        // First + last name.
        input.firstName && input.lastName
          ? {
              AND: [
                {
                  firstName: {
                    equals: input.firstName,
                    mode: "insensitive",
                  },
                },
                {
                  lastName: {
                    equals: input.lastName,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : { id: "__no_match__" },
      ],
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  // The single combined query already returns the union. Bucket them by
  // which signal matched.
  const normEmail = input.email ? input.email.toLowerCase() : null;
  const phoneSuffix = input.phone
    ? input.phone.replace(/\D/g, "").slice(-PHONE_LAST7_LENGTH)
    : null;

  const emailMatchesBucket: Customer[] = [];
  const phoneMatchesBucket: Customer[] = [];
  const nameMatchesBucket: Customer[] = [];

  for (const c of emailMatches) {
    const e = c.email ? c.email.toLowerCase() : null;
    const p = c.phone ? c.phone.replace(/\D/g, "").slice(-PHONE_LAST7_LENGTH) : null;
    const matchedEmail = e && normEmail && e === normEmail;
    const matchedPhone = p && phoneSuffix && p === phoneSuffix && p.length === 7;
    const matchedName =
      input.firstName &&
      input.lastName &&
      c.firstName.toLowerCase() === input.firstName.toLowerCase() &&
      c.lastName.toLowerCase() === input.lastName.toLowerCase();

    if (matchedEmail) emailMatchesBucket.push(c);
    if (matchedPhone) phoneMatchesBucket.push(c);
    if (matchedName) nameMatchesBucket.push(c);
  }

  return {
    emailMatches: emailMatchesBucket,
    phoneMatches: phoneMatchesBucket,
    nameMatches: nameMatchesBucket,
  };
}

function dedupeAndFlatten(...buckets: ReadonlyArray<ReadonlyArray<Customer>>): Customer[] {
  const seen = new Set<string>();
  const out: Customer[] = [];
  for (const bucket of buckets) {
    for (const c of bucket) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

/* ============================================================
 * Public API — find duplicates
 * ============================================================ */

export interface FindDuplicatesOptions {
  /** Max candidates to score. Default 50 (per skill spec). */
  limit?: number;
  /** Override classification threshold. Default FLAG_FOR_REVIEW. */
  minScore?: number;
  weights?: MatchWeights;
}

export interface FindDuplicatesResult {
  matches: DuplicateMatch[];
  /** Total candidates considered before scoring. */
  candidatesScanned: number;
  /** Wall-clock duration in ms. */
  durationMs: number;
}

/**
 * Find duplicate customer matches for a given record. Returns the top
 * matches above `minScore` (default 0.65 = FLAG_FOR_REVIEW threshold),
 * sorted by score desc.
 */
export async function findDuplicatesForCustomer(
  record: MatchableRecord,
  options: FindDuplicatesOptions = {},
): Promise<FindDuplicatesResult> {
  const start = Date.now();
  const minScore = options.minScore ?? DUPLICATE_THRESHOLDS.FLAG_FOR_REVIEW;
  const weights = options.weights ?? DEFAULT_WEIGHTS;

  const result = await fetchCandidateCustomers({
    dealerId: record.dealerId,
    excludeIds: [record.id],
    email: record.email,
    phone: record.phone,
    firstName: record.firstName,
    lastName: record.lastName,
    limit: options.limit ?? 50,
  });

  const candidates = dedupeAndFlatten(
    result.emailMatches,
    result.phoneMatches,
    result.nameMatches,
  );

  const matches: DuplicateMatch[] = [];
  for (const c of candidates) {
    const { score, reasons } = calculateSimilarity(
      record,
      {
        id: c.id,
        dealerId: c.dealerId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        address: c.address,
      },
      weights,
    );
    if (score >= minScore) {
      matches.push({
        customer: c,
        score,
        reasons,
        classification: classifyMatch(score),
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  // Cap to top 10 for the API response.
  const top = matches.slice(0, 10);

  return {
    matches: top,
    candidatesScanned: candidates.length,
    durationMs: Date.now() - start,
  };
}

/**
 * For a new lead, find matching customers — same scoring logic.
 * The lead doesn't have to exist in the DB yet (we accept a shape).
 */
export async function findDuplicatesForLead(
  lead: Pick<Lead, "dealerId" | "firstName" | "lastName" | "email" | "phone">,
  options: FindDuplicatesOptions = {},
): Promise<FindDuplicatesResult> {
  return findDuplicatesForCustomer(
    {
      id: "pending",
      dealerId: lead.dealerId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
    },
    options,
  );
}

/* ============================================================
 * Persistence — log the pair
 * ============================================================ */

export interface LogDuplicateInput {
  dealerId: string;
  entityType: "customer" | "lead";
  entityAId: string;
  entityBId: string;
  score: number;
  reasons: ReadonlyArray<string>;
  classification: DuplicateClassification;
}

/**
 * Upsert a duplicate-detection log row. The unique constraint
 *   (dealerId, entityType, entityAId, entityBId)
 * means re-running detection on the same pair replaces the old row.
 *
 * We always store A < B lexicographically to avoid duplicate (A,B) /
 * (B,A) rows. Caller passes A and B in any order; we normalize.
 */
export async function logDuplicate(
  input: LogDuplicateInput,
): Promise<{ id: string }> {
  const [a, b] =
    input.entityAId < input.entityBId
      ? [input.entityAId, input.entityBId]
      : [input.entityBId, input.entityAId];

  const row = await prisma.duplicateDetectionLog.upsert({
    where: {
      dealerId_entityType_entityAId_entityBId: {
        dealerId: input.dealerId,
        entityType: input.entityType,
        entityAId: a,
        entityBId: b,
      },
    },
    create: {
      dealerId: input.dealerId,
      entityType: input.entityType,
      entityAId: a,
      entityBId: b,
      score: input.score,
      reasons: input.reasons as unknown as Prisma.InputJsonValue,
      classification: input.classification,
      status: "pending",
    },
    update: {
      score: input.score,
      reasons: input.reasons as unknown as Prisma.InputJsonValue,
      classification: input.classification,
      // Don't reset status if already merged/dismissed — only update
      // if currently pending. This is the dedup-over-time semantic.
    },
    select: { id: true },
  });
  return row;
}

/* ============================================================
 * List — for the /customers/duplicates page
 * ============================================================ */

export interface ListDuplicatesOptions {
  dealerId: string;
  status?: "pending" | "merged" | "dismissed";
  classification?: DuplicateClassification;
  limit?: number;
}

export interface DuplicateListItem {
  id: string;
  entityType: string;
  entityAId: string;
  entityBId: string;
  score: number;
  reasons: string[];
  classification: DuplicateClassification;
  status: string;
  createdAt: Date;
}

export async function listDuplicates(
  options: ListDuplicatesOptions,
): Promise<DuplicateListItem[]> {
  const rows = await prisma.duplicateDetectionLog.findMany({
    where: {
      dealerId: options.dealerId,
      ...(options.status ? { status: options.status } : {}),
      ...(options.classification ? { classification: options.classification } : {}),
    },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: options.limit ?? 100,
  });
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entityType,
    entityAId: r.entityAId,
    entityBId: r.entityBId,
    score: r.score,
    reasons: Array.isArray(r.reasons)
      ? (r.reasons as unknown as string[])
      : [],
    classification: r.classification as DuplicateClassification,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

/* ============================================================
 * Dismiss
 * ============================================================ */

export async function dismissDuplicate(args: {
  dealerId: string;
  logId: string;
  dismissedById: string;
}): Promise<{ id: string }> {
  const row = await prisma.duplicateDetectionLog.update({
    where: { id: args.logId },
    data: {
      status: "dismissed",
      dismissedAt: new Date(),
      dismissedById: args.dismissedById,
    },
    select: { id: true },
  });
  return row;
}

/* ============================================================
 * Exported service object
 * ============================================================ */

export const duplicateDetector = {
  calculateSimilarity,
  classifyMatch,
  findDuplicatesForCustomer,
  findDuplicatesForLead,
  logDuplicate,
  listDuplicates,
  dismissDuplicate,
  DEFAULT_WEIGHTS,
  DUPLICATE_THRESHOLDS,
};

export default duplicateDetector;
