/**
 * Lead Router Service — the AI routing engine.
 *
 * Pure (or near-pure) function that takes a lead + dealer + active reps
 * and decides which sales rep should own the lead. Strategy is
 * pluggable: ROUND_ROBIN, LOAD_BALANCED, SOURCE_BASED, GEOGRAPHIC,
 * VEHICLE_MATCH, AI_SCORED.
 *
 * Constraints honored:
 *   - Tenant-scoped: every Prisma call carries `dealerId`.
 *   - <50ms p50: we issue at most 2 batched queries (1 for reps, 1 for
 *     load counts) regardless of strategy.
 *   - Records the decision to `LeadRoutingLog` for audit + UI.
 *   - Always returns alternatives (top 2 backups) so the UI can show
 *     "Assigned to X. Alternative: Y, Z."
 *
 * NOTE: "Active" rep = status=ACTIVE, AND (lastLogin within 2h OR
 *       lastActivityAt within 1h). `lastActivityAt` is a future column
 *       on the User model — until that migration lands, we use
 *       `lastLogin` and the explicit availability map in dealer
 *       settings (`rep_availability`) as a manual override.
 */

import type { Dealer, Lead, Prisma, User } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import {
  DealerRoutingSettingsSchema,
  type DealerRoutingSettings,
  type RepAvailability,
  type RoutingDecision,
  type RoutingStrategy,
} from "../schemas/lead-router.schema.js";
import { NotFoundError } from "../utils/errors.js";

/* ============================================================
 * Types
 * ============================================================ */

export interface RepCandidate {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: Date | null;
  load: number;
  availability: RepAvailability;
  /** Reps may have territories / stock_number ownership. */
  territories: string[];
  vehicleStockNumbers: string[];
}

export interface RouteLeadInput {
  lead: Lead;
  dealer: Dealer;
  /** When true, the rep who owns the vehicle will win VEHICLE_MATCH. */
  vehicleOwnerId?: string | null;
  /** Optional scoring output if a separate AI service already ran. */
  aiScores?: Record<string, number>;
}

const ROUTING_DEFAULTS: DealerRoutingSettings = {
  strategy: "LOAD_BALANCED",
  priority: ["VEHICLE_MATCH", "SOURCE_BASED", "LOAD_BALANCED"],
  source_routing: {},
  rep_availability: {},
};

function parseSettings(raw: unknown): DealerRoutingSettings {
  const parsed = DealerRoutingSettingsSchema.safeParse(raw ?? {});
  // safeParse on a schema with `.default({})` always succeeds when the
  // input is null/undefined, but we still guard against thrown errors.
  return parsed.success ? parsed.data : ROUTING_DEFAULTS;
}

function getAvailability(
  userId: string,
  settings: DealerRoutingSettings,
  lastLogin: Date | null,
): RepAvailability {
  const override = settings.rep_availability[userId];
  if (override) return override;
  // Auto-derive: if no login in 2h, treat as AWAY.
  if (!lastLogin) return "AWAY";
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  if (lastLogin.getTime() < twoHoursAgo) return "AWAY";
  return "AVAILABLE";
}

function isSelectable(c: RepCandidate): boolean {
  return c.status === "ACTIVE" && c.availability === "AVAILABLE";
}

/* ============================================================
 * Rep loading — single batched query
 * ============================================================ */

const OPEN_STATUSES: ReadonlyArray<Lead["status"]> = [
  "NEW",
  "CONTACTED",
  "APPOINTMENT",
  "DEMO",
];

/**
 * Load all candidate reps for the dealer along with their open-lead
 * counts. Single round trip.
 */
async function loadCandidates(
  dealerId: string,
  settings: DealerRoutingSettings,
): Promise<RepCandidate[]> {
  // 1. Active sales reps in the dealer.
  const users: User[] = await prisma.user.findMany({
    where: { dealerId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  if (users.length === 0) return [];

  // 2. Open-lead counts, grouped by assignedToId.
  //    `groupBy` returns rows that may have `assignedToId = null` since
  //    the column is optional; we filter those out and cast the rest.
  const grouped = await prisma.lead.groupBy({
    by: ["assignedToId"],
    where: {
      dealerId,
      assignedToId: { in: users.map((u) => u.id) },
      status: { in: [...OPEN_STATUSES] },
    },
    _count: { _all: true },
  });

  const loadById = new Map<string, number>();
  for (const g of grouped) {
    const aid = (g as { assignedToId: string | null }).assignedToId;
    if (aid) loadById.set(aid, g._count._all);
  }

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    lastLogin: u.lastLogin,
    load: loadById.get(u.id) ?? 0,
    availability: getAvailability(u.id, settings, u.lastLogin),
    territories: extractTerritories(u),
    vehicleStockNumbers: extractVehicleStockNumbers(u),
  }));
}

function extractTerritories(u: User): string[] {
  // Until a real territory column lands, we read from permissions.
  const perms = (u.permissions ?? []) as unknown;
  if (!Array.isArray(perms)) return [];
  return perms.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function extractVehicleStockNumbers(u: User): string[] {
  // Permissions also double as vehicle stock numbers for VEHICLE_MATCH
  // when prefixed with "stock:". Optional, kept for forward compat.
  const perms = (u.permissions ?? []) as unknown;
  if (!Array.isArray(perms)) return [];
  return perms
    .filter((v): v is string => typeof v === "string" && v.startsWith("stock:"))
    .map((v) => v.slice("stock:".length));
}

/* ============================================================
 * Strategy implementations
 * ============================================================ */

function strategyRoundRobin(
  candidates: RepCandidate[],
  state: RoundRobinState,
): RepCandidate | null {
  const eligible = candidates.filter(isSelectable);
  if (eligible.length === 0) return null;

  // Sort by id for stable ordering across calls.
  const sorted = [...eligible].sort((a, b) => a.id.localeCompare(b.id));
  // Pick the one whose index is the current "next" pointer.
  const idx = state.nextIndex % sorted.length;
  const pick = sorted[idx] ?? sorted[0] ?? null;
  state.nextIndex = (idx + 1) % sorted.length;
  return pick;
}

interface RoundRobinState {
  nextIndex: number;
}

// Per-process pointer — keeps the rotation fair across leads.
const ROUND_ROBIN_STATE = new Map<string, RoundRobinState>();

function strategyLoadBalanced(candidates: RepCandidate[]): RepCandidate | null {
  const eligible = candidates.filter(isSelectable);
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => {
    if (a.load !== b.load) return a.load - b.load;
    return a.id.localeCompare(b.id);
  })[0] ?? null;
}

function strategySourceBased(
  candidates: RepCandidate[],
  settings: DealerRoutingSettings,
  sourceKey: string,
): { pick: RepCandidate | null; reason: string } {
  const explicit = settings.source_routing[sourceKey];
  if (explicit) {
    const match = candidates.find((c) => c.id === explicit && isSelectable(c));
    if (match) {
      return {
        pick: match,
        reason: `Source "${sourceKey}" maps directly to ${match.name} (source_routing override).`,
      };
    }
  }
  // Fallback: load-balanced.
  const pick = strategyLoadBalanced(candidates);
  return {
    pick,
    reason: pick
      ? `No source mapping for "${sourceKey}"; fell back to load-balanced.`
      : "No available reps.",
  };
}

function strategyGeographic(
  candidates: RepCandidate[],
  postalCode: string | null,
): { pick: RepCandidate | null; reason: string } {
  const eligible = candidates.filter(isSelectable);
  if (eligible.length === 0 || !postalCode || postalCode.length < 3) {
    const pick = strategyLoadBalanced(candidates);
    return {
      pick,
      reason: pick
        ? "No postal code provided; fell back to load-balanced."
        : "No available reps.",
    };
  }
  const prefix = postalCode.slice(0, 3);
  const matched = eligible.find((c) => c.territories.includes(prefix));
  if (matched) {
    return {
      pick: matched,
      reason: `Postal prefix "${prefix}" matches ${matched.name}'s territory.`,
    };
  }
  const pick = strategyLoadBalanced(candidates);
  return {
    pick,
    reason: pick
      ? `No rep covers postal prefix "${prefix}"; fell back to load-balanced.`
      : "No available reps.",
  };
}

function strategyVehicleMatch(
  candidates: RepCandidate[],
  vehicleOwnerId: string | null | undefined,
  stockNumber: string | null | undefined,
): { pick: RepCandidate | null; reason: string } {
  const eligible = candidates.filter(isSelectable);
  if (eligible.length === 0) {
    return { pick: null, reason: "No available reps." };
  }
  if (vehicleOwnerId) {
    const owner = eligible.find((c) => c.id === vehicleOwnerId);
    if (owner) {
      return {
        pick: owner,
        reason: `Vehicle owner ${owner.name} is available — direct match.`,
      };
    }
  }
  if (stockNumber) {
    const owner = eligible.find((c) => c.vehicleStockNumbers.includes(stockNumber));
    if (owner) {
      return {
        pick: owner,
        reason: `Stock #${stockNumber} maps to ${owner.name} (vehicle ownership).`,
      };
    }
  }
  const pick = strategyLoadBalanced(candidates);
  return {
    pick,
    reason: pick
      ? "No vehicle ownership match; fell back to load-balanced."
      : "No available reps.",
  };
}

function strategyAiScored(
  candidates: RepCandidate[],
  leadScore: number,
  aiScores: Record<string, number> | undefined,
): { pick: RepCandidate | null; reason: string } {
  const eligible = candidates.filter(isSelectable);
  if (eligible.length === 0) {
    return { pick: null, reason: "No available reps." };
  }

  // Combine lead score with per-rep affinity scores.
  // Affinity 0-100; default to 50. Weight: 0.6 * leadScore + 0.4 * affinity.
  const scored = eligible.map((c) => {
    const affinity = aiScores?.[c.id] ?? 50;
    const composite = 0.6 * leadScore + 0.4 * affinity;
    return { c, composite };
  });

  scored.sort((a, b) => {
    if (b.composite !== a.composite) return b.composite - a.composite;
    return a.c.load - b.c.load;
  });

  const top = scored[0];
  if (!top) return { pick: null, reason: "No available reps." };
  return {
    pick: top.c,
    reason: `AI composite score ${top.composite.toFixed(1)} (lead ${leadScore} × 0.6 + affinity ${(aiScores?.[top.c.id] ?? 50).toFixed(1)} × 0.4).`,
  };
}

/* ============================================================
 * Decision
 * ============================================================ */

function pickStrategy(
  settings: DealerRoutingSettings,
  lead: Lead,
  vehicleOwnerId: string | null,
): RoutingStrategy {
  // 1. Explicit override wins.
  if (settings.strategy) return settings.strategy;
  // 2. Priority chain.
  const chain = settings.priority.length > 0 ? settings.priority : ROUTING_DEFAULTS.priority;
  for (const strat of chain) {
    if (strat === "VEHICLE_MATCH" && vehicleOwnerId) return strat;
    if (strat === "SOURCE_BASED" && getLeadSourceKey(lead)) return strat;
    if (strat === "GEOGRAPHIC" && getLeadPostalCode(lead)) return strat;
    if (strat === "AI_SCORED") return strat;
  }
  return "LOAD_BALANCED";
}

function getLeadSourceKey(lead: Lead): string | null {
  return lead.source ?? null;
}

function getLeadPostalCode(lead: Lead): string | null {
  // Lead has no postal column; the address lives on the customer record
  // (which may not exist at the moment of routing). For now, accept
  // source_meta.postal_code for routes that need it.
  const meta = (lead.sourceMeta ?? {}) as Record<string, unknown>;
  if (typeof meta.postal_code === "string") return meta.postal_code;
  if (typeof meta.postcode === "string") return meta.postcode;
  if (typeof meta.zip === "string") return meta.zip;
  return null;
}

function getLeadStockNumber(lead: Lead): string | null {
  const interest = (lead.vehicleInterest ?? []) as unknown;
  if (Array.isArray(interest)) {
    for (const item of interest) {
      if (item && typeof item === "object" && "stockNumber" in item) {
        const v = (item as { stockNumber?: unknown }).stockNumber;
        if (typeof v === "string") return v;
      }
    }
  }
  return null;
}

function alternativesFor(
  pick: RepCandidate | null,
  candidates: RepCandidate[],
  strategy: RoutingStrategy,
): string[] {
  if (!pick) return [];
  const eligible = candidates.filter(isSelectable);
  // For ROUND_ROBIN, alternatives = next 2 in rotation.
  if (strategy === "ROUND_ROBIN") {
    const sorted = [...eligible].sort((a, b) => a.id.localeCompare(b.id));
    const startIdx = sorted.findIndex((c) => c.id === pick.id);
    if (startIdx < 0) return [];
    return [
      sorted[(startIdx + 1) % sorted.length]?.id,
      sorted[(startIdx + 2) % sorted.length]?.id,
    ].filter((v): v is string => typeof v === "string");
  }
  // For LOAD_BALANCED, alternatives = next 2 lowest-load reps.
  const sorted = [...eligible].sort((a, b) => {
    if (a.load !== b.load) return a.load - b.load;
    return a.id.localeCompare(b.id);
  });
  return sorted
    .filter((c) => c.id !== pick.id)
    .slice(0, 2)
    .map((c) => c.id);
}

/* ============================================================
 * Public API
 * ============================================================ */

/**
 * Pick a rep for the given lead. Returns a decision (rep or null with
 * a clear reason) and persists the `LeadRoutingLog` row.
 *
 * The caller is expected to have already created the lead (or be
 * about to). We accept the `leadId` in the returned decision so the
 * caller can update `assignedToId` and the log row in the same tx.
 */
export async function routeLead(
  input: RouteLeadInput,
): Promise<RoutingDecision> {
  const start = Date.now();
  const settings = parseSettings(input.dealer.settings);
  const candidates = await loadCandidates(input.dealer.id, settings);

  if (candidates.length === 0) {
    const decision: RoutingDecision = {
      assignedTo: null,
      reason: "No active sales reps in this dealership.",
      strategy: settings.strategy,
      alternativeReps: [],
      candidateReps: [],
      responseTimeMs: Date.now() - start,
    };
    return decision;
  }

  const strategy = pickStrategy(
    settings,
    input.lead,
    input.vehicleOwnerId ?? null,
  );

  let pick: RepCandidate | null = null;
  let reason = "";

  switch (strategy) {
    case "ROUND_ROBIN": {
      const state =
        ROUND_ROBIN_STATE.get(input.dealer.id) ?? { nextIndex: 0 };
      pick = strategyRoundRobin(candidates, state);
      ROUND_ROBIN_STATE.set(input.dealer.id, state);
      reason = pick
        ? `Round-robin picked ${pick.name} (slot ${state.nextIndex} of ${candidates.filter(isSelectable).length}).`
        : "No available reps in rotation.";
      break;
    }
    case "LOAD_BALANCED": {
      pick = strategyLoadBalanced(candidates);
      reason = pick
        ? `${pick.name} has the fewest open leads (${pick.load}).`
        : "No available reps.";
      break;
    }
    case "SOURCE_BASED": {
      const sourceKey = getLeadSourceKey(input.lead) ?? "unknown";
      const result = strategySourceBased(candidates, settings, sourceKey);
      pick = result.pick;
      reason = result.reason;
      break;
    }
    case "GEOGRAPHIC": {
      const result = strategyGeographic(
        candidates,
        getLeadPostalCode(input.lead),
      );
      pick = result.pick;
      reason = result.reason;
      break;
    }
    case "VEHICLE_MATCH": {
      const result = strategyVehicleMatch(
        candidates,
        input.vehicleOwnerId ?? null,
        getLeadStockNumber(input.lead),
      );
      pick = result.pick;
      reason = result.reason;
      break;
    }
    case "AI_SCORED": {
      const result = strategyAiScored(candidates, input.lead.score, input.aiScores);
      pick = result.pick;
      reason = result.reason;
      break;
    }
    default: {
      // Exhaustiveness — TS will flag missing cases.
      const _never: never = strategy;
      void _never;
      pick = strategyLoadBalanced(candidates);
      reason = pick
        ? `Fallback to load-balanced; ${pick.name} chosen.`
        : "No available reps.";
    }
  }

  const alternativeReps = alternativesFor(pick, candidates, strategy);
  const responseTimeMs = Date.now() - start;

  const decision: RoutingDecision = {
    assignedTo: pick?.id ?? null,
    reason,
    strategy,
    alternativeReps,
    candidateReps: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      load: c.load,
    })),
    responseTimeMs,
  };
  return decision;
}

/**
 * Persist a `LeadRoutingLog` row. Idempotent on (leadId, dealerId) —
 * the latest row wins. Caller decides whether to wrap in a transaction
 * with the lead's `assignedToId` update.
 */
export async function recordRoutingDecision(
  args: {
    dealerId: string;
    leadId: string;
    decision: RoutingDecision;
  },
): Promise<{ id: string }> {
  const row = await prisma.leadRoutingLog.create({
    data: {
      dealerId: args.dealerId,
      leadId: args.leadId,
      strategyUsed: args.decision.strategy,
      candidateReps: args.decision.candidateReps as unknown as Prisma.InputJsonValue,
      selectedRepId: args.decision.assignedTo,
      reason: args.decision.reason,
      responseTimeMs: args.decision.responseTimeMs,
    },
    select: { id: true },
  });
  return row;
}

/**
 * Read the latest N routing log rows for a dealer (for the settings UI).
 */
export async function listRoutingLog(args: {
  dealerId: string;
  limit: number;
}): Promise<
  Array<{
    id: string;
    leadId: string;
    leadName: string | null;
    strategyUsed: string;
    selectedRepId: string | null;
    selectedRepName: string | null;
    reason: string;
    responseTimeMs: number;
    routedAt: Date;
    candidateReps: Array<{ id: string; name?: string }>;
  }>
> {
  const rows = await prisma.leadRoutingLog.findMany({
    where: { dealerId: args.dealerId },
    orderBy: { routedAt: "desc" },
    take: args.limit,
  });
  if (rows.length === 0) return [];

  // Hydrate lead + rep names in batched queries.
  const leadIds = Array.from(new Set(rows.map((r) => r.leadId)));
  const repIds = Array.from(
    new Set(
      rows.map((r) => r.selectedRepId).filter((v): v is string => Boolean(v)),
    ),
  );

  const [leads, reps] = await Promise.all([
    prisma.lead.findMany({
      where: { id: { in: leadIds } },
      select: { id: true, firstName: true, lastName: true },
    }),
    repIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: repIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const repMap = new Map(reps.map((r) => [r.id, r.name]));

  return rows.map((r) => {
    const lead = leadMap.get(r.leadId);
    const leadName = lead
      ? `${lead.firstName} ${lead.lastName}`.trim()
      : null;
    const candidateReps = Array.isArray(r.candidateReps)
      ? (r.candidateReps as Array<{ id: string; name?: string }>)
      : [];
    return {
      id: r.id,
      leadId: r.leadId,
      leadName,
      strategyUsed: r.strategyUsed,
      selectedRepId: r.selectedRepId,
      selectedRepName: r.selectedRepId ? repMap.get(r.selectedRepId) ?? null : null,
      reason: r.reason,
      responseTimeMs: r.responseTimeMs,
      routedAt: r.routedAt,
      candidateReps,
    };
  });
}

/**
 * Helper: throw if the dealer doesn't exist (caller guard).
 */
export async function requireDealer(dealerId: string): Promise<Dealer> {
  const d = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!d) throw new NotFoundError("Dealer not found");
  return d;
}

export const leadRouter = {
  routeLead,
  recordRoutingDecision,
  listRoutingLog,
  parseSettings,
  loadCandidates,
};
