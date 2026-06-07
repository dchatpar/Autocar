/**
 * AI Lead Routing Engine — Advanced routing strategies for lead assignment.
 *
 * Implements ALL 6 routing strategies:
 *   1. ROUND_ROBIN   — cycle through available agents
 *   2. LOAD_BALANCED — assign to agent with fewest active leads
 *   3. SOURCE_BASED  — route by lead source (web→BDC, phone→sales, walk-in→floor)
 *   4. GEOGRAPHIC    — assign by customer zip code to geo zone
 *   5. VEHICLE_MATCH — assign to agent specializing in that vehicle type
 *   6. AI_SCORED     — assign to best-fit agent using agent skills + lead profile
 *
 * Features:
 *   - Logs every decision to LeadRoutingLog
 *   - Emits real-time events for WebSocket notification
 *   - Tenant-scoped: every Prisma query includes dealerId
 *   - Returns alternatives (top 2 backups) for UI display
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
import { realtimeService } from "./realtime.service.js";

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
  /** Rep territories (postal code prefixes) */
  territories: string[];
  /** Vehicle makes/models the rep specializes in */
  specializations: string[];
  /** Historical performance score (0-100) */
  performanceScore: number;
}

export interface RouteLeadInput {
  lead: Lead;
  dealer: Dealer;
  vehicleOwnerId?: string | null;
  aiScores?: Record<string, number>;
}

export interface RoutingStrategyConfig {
  strategy: RoutingStrategy;
  priority: RoutingStrategy[];
  sourceRouting: Record<string, string>;
  repAvailability: Record<string, RepAvailability>;
}

const ROUTING_DEFAULTS: DealerRoutingSettings = {
  strategy: "LOAD_BALANCED",
  priority: ["VEHICLE_MATCH", "SOURCE_BASED", "LOAD_BALANCED"],
  source_routing: {},
  rep_availability: {},
};

function parseSettings(raw: unknown): DealerRoutingSettings {
  const parsed = DealerRoutingSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : ROUTING_DEFAULTS;
}

function getAvailability(
  userId: string,
  settings: DealerRoutingSettings,
  lastLogin: Date | null,
): RepAvailability {
  const override = settings.rep_availability[userId];
  if (override) return override;
  if (!lastLogin) return "OFF_DUTY";
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  if (lastLogin.getTime() < twoHoursAgo) return "AWAY";
  return "AVAILABLE";
}

function isSelectable(c: RepCandidate): boolean {
  return c.status === "ACTIVE" && c.availability === "AVAILABLE";
}

/* ============================================================
 * Rep loading
 * ============================================================ */

const OPEN_STATUSES: ReadonlyArray<Lead["status"]> = [
  "NEW",
  "CONTACTED",
  "APPOINTMENT",
  "DEMO",
];

/**
 * Load all candidate reps with their load counts.
 * Single batched query for performance.
 */
async function loadCandidates(
  dealerId: string,
  settings: DealerRoutingSettings,
): Promise<RepCandidate[]> {
  const users: User[] = await prisma.user.findMany({
    where: { dealerId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  if (users.length === 0) return [];

  // Get open-lead counts per rep
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
    specializations: extractSpecializations(u),
    performanceScore: 50, // Default, could be calculated from historical data
  }));
}

function extractTerritories(u: User): string[] {
  const perms = (u.permissions ?? []) as unknown;
  if (!Array.isArray(perms)) return [];
  return perms
    .filter((v): v is string => typeof v === "string" && v.startsWith("territory:"))
    .map((v) => v.slice("territory:".length));
}

function extractSpecializations(u: User): string[] {
  const perms = (u.permissions ?? []) as unknown;
  if (!Array.isArray(perms)) return [];
  return perms
    .filter((v): v is string => typeof v === "string" && v.startsWith("specialize:"))
    .map((v) => v.slice("specialize:".length));
}

/* ============================================================
 * Strategy implementations
 * ============================================================ */

// Round-robin state per dealer (in-memory for simplicity)
const ROUND_ROBIN_STATE = new Map<string, number>();

function strategyRoundRobin(candidates: RepCandidate[], dealerId: string): RepCandidate | null {
  const eligible = candidates.filter(isSelectable);
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((a, b) => a.id.localeCompare(b.id));
  const currentIndex = ROUND_ROBIN_STATE.get(dealerId) ?? 0;
  const pick = sorted[currentIndex % sorted.length] ?? null;
  ROUND_ROBIN_STATE.set(dealerId, (currentIndex + 1) % sorted.length);
  return pick;
}

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
  source: string | null,
): { pick: RepCandidate | null; reason: string } {
  if (!source) {
    const pick = strategyLoadBalanced(candidates);
    return { pick, reason: "No source specified; fell back to load-balanced." };
  }

  // Check explicit mapping
  const explicitRepId = settings.source_routing[source];
  if (explicitRepId) {
    const match = candidates.find((c) => c.id === explicitRepId && isSelectable(c));
    if (match) {
      return { pick: match, reason: `Source "${source}" maps to ${match.name}.` };
    }
  }

  // Fallback rules
  const sourceLower = source.toLowerCase();
  if (sourceLower.includes("meta") || sourceLower.includes("facebook") || sourceLower.includes("web")) {
    const bdc = candidates.find((c) => c.role === "BDC" && isSelectable(c));
    if (bdc) return { pick: bdc, reason: `Source "${source}" routed to BDC agent ${bdc.name}.` };
  }
  if (sourceLower.includes("phone") || sourceLower.includes("call")) {
    const sales = candidates.find((c) => c.role === "SALES" && isSelectable(c));
    if (sales) return { pick: sales, reason: `Source "${source}" routed to sales agent ${sales?.name}.` };
  }
  if (sourceLower.includes("walk") || sourceLower.includes("floor")) {
    const floor = candidates.find((c) => c.role === "SALES" && isSelectable(c));
    if (floor) return { pick: floor, reason: `Source "${source}" routed to floor sales.` };
  }

  const pick = strategyLoadBalanced(candidates);
  return { pick, reason: `No rule for source "${source}"; fell back to load-balanced.` };
}

function strategyGeographic(
  candidates: RepCandidate[],
  postalCode: string | null,
): { pick: RepCandidate | null; reason: string } {
  const eligible = candidates.filter(isSelectable);
  if (eligible.length === 0 || !postalCode || postalCode.length < 3) {
    const pick = strategyLoadBalanced(candidates);
    return { pick, reason: "No postal code; fell back to load-balanced." };
  }

  const prefix = postalCode.slice(0, 3);
  const matched = eligible.find((c) => c.territories.includes(prefix));
  if (matched) {
    return { pick: matched, reason: `Postal prefix "${prefix}" matches ${matched.name}'s territory.` };
  }

  const pick = strategyLoadBalanced(candidates);
  return { pick, reason: `No territory match for "${prefix}"; fell back to load-balanced.` };
}

function strategyVehicleMatch(
  candidates: RepCandidate[],
  vehicleOwnerId: string | null | undefined,
  vehicleInterest: unknown,
): { pick: RepCandidate | null; reason: string } {
  const eligible = candidates.filter(isSelectable);
  if (eligible.length === 0) {
    return { pick: null, reason: "No available reps." };
  }

  // Direct vehicle owner
  if (vehicleOwnerId) {
    const owner = eligible.find((c) => c.id === vehicleOwnerId);
    if (owner) {
      return { pick: owner, reason: `Vehicle owner ${owner.name} is available.` };
    }
  }

  // Match by specialization
  if (vehicleInterest) {
    const interestStr = typeof vehicleInterest === "string"
      ? vehicleInterest
      : JSON.stringify(vehicleInterest);

    const makeMatch = eligible.find((c) =>
      c.specializations.some((s) =>
        interestStr.toLowerCase().includes(s.toLowerCase())
      )
    );

    if (makeMatch) {
      return { pick: makeMatch, reason: `${makeMatch.name} specializes in the requested vehicle type.` };
    }
  }

  const pick = strategyLoadBalanced(candidates);
  return { pick, reason: "No vehicle match; fell back to load-balanced." };
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

  // Composite score: 0.5 * leadScore + 0.3 * aiAffinity + 0.2 * performance
  const scored = eligible.map((c) => {
    const affinity = aiScores?.[c.id] ?? 50;
    const composite = 0.5 * leadScore + 0.3 * affinity + 0.2 * c.performanceScore;
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
    reason: `AI composite score ${top.composite.toFixed(1)} (lead=${leadScore}, affinity=${aiScores?.[top.c.id] ?? 50}, perf=${top.c.performanceScore}).`,
  };
}

/* ============================================================
 * Strategy selection
 * ============================================================ */

function pickStrategy(
  settings: DealerRoutingSettings,
  lead: Lead,
  vehicleOwnerId: string | null,
): RoutingStrategy {
  if (settings.strategy) return settings.strategy;

  const chain = settings.priority.length > 0 ? settings.priority : ROUTING_DEFAULTS.priority;
  for (const strat of chain) {
    if (strat === "VEHICLE_MATCH" && vehicleOwnerId) return strat;
    if (strat === "SOURCE_BASED" && lead.source) return strat;
    if (strat === "GEOGRAPHIC" && getLeadPostalCode(lead)) return strat;
    if (strat === "AI_SCORED") return strat;
  }
  return "LOAD_BALANCED";
}

function getLeadPostalCode(lead: Lead): string | null {
  const meta = (lead.sourceMeta ?? {}) as Record<string, unknown>;
  if (typeof meta.postal_code === "string") return meta.postal_code;
  if (typeof meta.postcode === "string") return meta.postcode;
  if (typeof meta.zip === "string") return meta.zip;
  return null;
}

function getLeadVehicleInterest(lead: Lead): unknown {
  return lead.vehicleInterest;
}

function alternativesFor(
  pick: RepCandidate | null,
  candidates: RepCandidate[],
): string[] {
  if (!pick) return [];
  const eligible = candidates.filter(isSelectable);
  const sorted = [...eligible].sort((a, b) => {
    if (a.load !== b.load) return a.load - b.load;
    return a.id.localeCompare(b.id);
  });
  return sorted.filter((c) => c.id !== pick.id).slice(0, 2).map((c) => c.id);
}

/* ============================================================
 * Public API
 * ============================================================ */

export async function routeLead(
  input: RouteLeadInput,
): Promise<RoutingDecision> {
  const start = Date.now();
  const settings = parseSettings(input.dealer.settings);
  const candidates = await loadCandidates(input.dealer.id, settings);

  if (candidates.length === 0) {
    return {
      assignedTo: null,
      reason: "No active sales reps in this dealership.",
      strategy: settings.strategy,
      alternativeReps: [],
      candidateReps: [],
      responseTimeMs: Date.now() - start,
    };
  }

  const strategy = pickStrategy(settings, input.lead, input.vehicleOwnerId ?? null);

  let pick: RepCandidate | null = null;
  let reason = "";

  switch (strategy) {
    case "ROUND_ROBIN":
      pick = strategyRoundRobin(candidates, input.dealer.id);
      reason = pick ? `Round-robin assigned to ${pick.name}.` : "No available reps.";
      break;
    case "LOAD_BALANCED":
      pick = strategyLoadBalanced(candidates);
      reason = pick ? `${pick.name} has the fewest open leads (${pick.load}).` : "No available reps.";
      break;
    case "SOURCE_BASED": {
      const result = strategySourceBased(candidates, settings, input.lead.source);
      pick = result.pick;
      reason = result.reason;
      break;
    }
    case "GEOGRAPHIC": {
      const result = strategyGeographic(candidates, getLeadPostalCode(input.lead));
      pick = result.pick;
      reason = result.reason;
      break;
    }
    case "VEHICLE_MATCH": {
      const result = strategyVehicleMatch(
        candidates,
        input.vehicleOwnerId ?? null,
        getLeadVehicleInterest(input.lead),
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
    default:
      pick = strategyLoadBalanced(candidates);
      reason = "Fallback to load-balanced.";
  }

  const alternativeReps = alternativesFor(pick, candidates);
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

export async function emitRoutingNotification(
  dealerId: string,
  leadId: string,
  assignedToId: string | null,
  reason: string,
): Promise<void> {
  if (assignedToId) {
    realtimeService.emitLeadAssigned(dealerId, {
      leadId,
      assignedToId,
      assignedById: "ROUTER",
    });
  }
}

export const routingService = {
  routeLead,
  recordRoutingDecision,
  emitRoutingNotification,
  loadCandidates,
};

export default routingService;
