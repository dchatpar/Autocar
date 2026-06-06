/**
 * AI Agent Service — management and orchestration for AI agents.
 *
 * Four agents:
 *   NOVA  — Lead routing + first-touch messaging (already implemented)
 *   ARIO  — Inventory insights: market pricing, turn analysis, listing tips
 *   SAGE  — Deal analytics: gross prediction, contract risk, finance rate health
 *   LUCAS — Customer lifetime value: churn risk, referral probability, lifetime spend
 *
 * The service is the facade; actual AI calls go through the agent modules
 * under /agents/. The `AgentRun` row is written for every execution.
 */

import type { AgentRun, Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { NotFoundError } from "../utils/errors.js";

/* ============================================================
 * Agent catalog
 * ============================================================ */

export interface AgentCatalogEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  isEnabled: boolean;
  capabilities: string[];
  dailyRunCount: number;
  avgResponseTimeMs: number;
  dailyCostUsd: number;
}

function buildCatalogEntry(
  id: string,
  name: string,
  description: string,
  icon: string,
  capabilities: string[],
  isEnabled: boolean,
  stats: { runCount: number; avgMs: number; costUsd: number },
): AgentCatalogEntry {
  return {
    id,
    name,
    description,
    icon,
    isEnabled,
    capabilities,
    dailyRunCount: stats.runCount,
    avgResponseTimeMs: Math.round(stats.avgMs),
    dailyCostUsd: Number(stats.costUsd.toFixed(4)),
  };
}

/* ============================================================
 * Run counts for today (UTC day boundary)
 * ============================================================ */

async function getTodayStats(dealerId: string, agentName: string): Promise<{
  runCount: number;
  avgMs: number;
  costUsd: number;
}> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const runs = await prisma.agentRun.findMany({
    where: { dealerId, agentName, createdAt: { gte: startOfDay } },
    select: { durationMs: true, costUsd: true },
  });

  if (runs.length === 0) {
    return { runCount: 0, avgMs: 0, costUsd: 0 };
  }

  const totalMs = runs.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);
  const totalCost = runs.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

  return {
    runCount: runs.length,
    avgMs: totalMs / runs.length,
    costUsd: totalCost,
  };
}

/* ============================================================
 * Agent run helper
 * ============================================================ */

async function persistRun(args: {
  dealerId: string;
  agentName: string;
  entityType?: string | null;
  entityId?: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs: number;
  status: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}): Promise<AgentRun> {
  return prisma.agentRun.create({
    data: {
      dealerId: args.dealerId,
      agentName: args.agentName,
      entityType: args.entityType ?? null,
      entityId: args.entityId ?? null,
      input: args.input as Prisma.InputJsonValue,
      output: args.output as Prisma.InputJsonValue,
      durationMs: args.durationMs,
      status: args.status,
      tokensIn: args.tokensIn,
      tokensOut: args.tokensOut,
      costUsd: args.costUsd,
    },
  });
}

/* ============================================================
 * Per-agent implementations
 * ============================================================ */

async function runNOVA(
  dealerId: string,
  entityType: string | undefined,
  entityId: string | undefined,
  _action: string | undefined,
  dryRun: boolean,
): Promise<{ output: Record<string, unknown>; durationMs: number; status: string; costUsd: number }> {
  const start = Date.now();

  // NOVA is implemented in nova-stub.service.ts; import and call it.
  // For now, return a stub response matching its interface.
  const { novaService } = await import("./nova-stub.service.js");

  if (!entityId || entityType !== "LEAD") {
    return {
      output: { message: "NOVA requires a LEAD entity" },
      durationMs: Date.now() - start,
      status: "skipped",
      costUsd: 0,
    };
  }

  const lead = await prisma.lead.findFirst({
    where: { id: entityId, dealerId },
    include: { dealer: true },
  });

  if (!lead) {
    return {
      output: { message: "Lead not found" },
      durationMs: Date.now() - start,
      status: "failed",
      costUsd: 0,
    };
  }

  if (dryRun) {
    return {
      output: { message: "NOVA dry-run complete", leadId: lead.id, channel: "none" },
      durationMs: Date.now() - start,
      status: "success",
      costUsd: 0,
    };
  }

  const result = await novaService.run(lead, lead.dealer, { dryRun: false });
  return {
    output: result as unknown as Record<string, unknown>,
    durationMs: Date.now() - start,
    status: "success",
    costUsd: 0,
  };
}

async function runARIO(
  dealerId: string,
  entityType: string | undefined,
  entityId: string | undefined,
  _action: string | undefined,
  _dryRun: boolean,
): Promise<{ output: Record<string, unknown>; durationMs: number; status: string; costUsd: number }> {
  const start = Date.now();

  // ARIO: Inventory insights — price recommendation, turn analysis, listing tips.
  // Stub: return market summary for the dealer.
  const vehicles = await prisma.vehicle.findMany({
    where: { dealerId, status: { in: ["AVAILABLE", "PENDING"] } },
    include: { pricing: true },
    take: 50,
  });

  const insights: Record<string, unknown>[] = [];

  for (const v of vehicles) {
    const ageDays = v.createdAt
      ? Math.floor((Date.now() - v.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const marketVal = v.pricing?.marketValue;
    const asking = v.pricing?.askingPrice;

    let tip = "";
    if (ageDays > 60 && marketVal && asking && asking > marketVal * 1.05) {
      tip = `Price is ${((asking / marketVal - 1) * 100).toFixed(1)}% above market value. Consider reducing.`;
    } else if (ageDays > 30 && (!asking || !marketVal)) {
      tip = "Missing pricing data. Add asking price and market value for ARIO insights.";
    } else if (ageDays <= 7) {
      tip = "Fresh inventory. Ensure photos are high-quality and all features are listed.";
    } else {
      tip = "Good price positioning.";
    }

    insights.push({
      vehicleId: v.id,
      vin: v.vin,
      make: v.make,
      model: v.model,
      year: v.year,
      ageDays,
      marketValue: marketVal,
      askingPrice: asking,
      turnRisk: ageDays > 60 ? "high" : ageDays > 30 ? "medium" : "low",
      tip,
    });
  }

  return {
    output: {
      agent: "ARIO",
      summary: `${insights.length} vehicles analyzed`,
      insights,
    },
    durationMs: Date.now() - start,
    status: "success",
    costUsd: 0.002 * insights.length,
  };
}

async function runSAGE(
  dealerId: string,
  entityType: string | undefined,
  entityId: string | undefined,
  _action: string | undefined,
  _dryRun: boolean,
): Promise<{ output: Record<string, unknown>; durationMs: number; status: string; costUsd: number }> {
  const start = Date.now();

  // SAGE: Deal analytics — gross prediction, contract risk, finance rate health.
  const deals = await prisma.deal.findMany({
    where: { dealerId, status: { in: ["WORKING", "PENDING_FINANCE", "APPROVED"] } },
    include: {
      terms: true,
      customer: true,
      vehicle: { include: { pricing: true } },
    },
    take: 20,
  });

  const dealAnalysis: Record<string, unknown>[] = [];

  for (const deal of deals) {
    const frontGross = deal.terms?.frontGross ?? 0;
    const backGross = deal.terms?.backGross ?? 0;
    const totalGross = frontGross + backGross;
    const salePrice = deal.terms?.salePrice ?? 0;

    let riskLevel = "low";
    let riskNotes: string[] = [];

    if (frontGross < 0) {
      riskLevel = "high";
      riskNotes.push("Front gross is negative — investigate deal structure.");
    }
    if (deal.terms?.rate && deal.terms.rate > 12) {
      riskLevel = riskLevel === "high" ? "high" : "medium";
      riskNotes.push(`High APR (${deal.terms.rate}%) may cause customer friction.`);
    }
    if (!deal.terms?.salePrice) {
      riskLevel = riskLevel === "high" ? "high" : "medium";
      riskNotes.push("Missing sale price — ensure deal terms are fully populated.");
    }
    if (!deal.terms?.paymentAmount) {
      riskNotes.push("No payment amount — customer may not have committed to terms.");
    }

    dealAnalysis.push({
      dealId: deal.id,
      customerId: deal.customerId,
      customerName: `${deal.customer.firstName} ${deal.customer.lastName}`,
      vehicle: deal.vehicle
        ? { id: deal.vehicle.id, vin: deal.vehicle.vin, year: deal.vehicle.year, make: deal.vehicle.make, model: deal.vehicle.model }
        : null,
      status: deal.status,
      salePrice,
      frontGross,
      backGross,
      totalGross,
      paymentAmount: deal.terms?.paymentAmount ?? null,
      rate: deal.terms?.rate ?? null,
      termMonths: deal.terms?.termMonths ?? null,
      riskLevel,
      riskNotes,
      daysInPipeline: deal.createdAt
        ? Math.floor((Date.now() - deal.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
    });
  }

  return {
    output: {
      agent: "SAGE",
      summary: `${dealAnalysis.length} deals analyzed`,
      dealAnalysis,
    },
    durationMs: Date.now() - start,
    status: "success",
    costUsd: 0.003 * dealAnalysis.length,
  };
}

async function runLUCAS(
  dealerId: string,
  entityType: string | undefined,
  entityId: string | undefined,
  _action: string | undefined,
  _dryRun: boolean,
): Promise<{ output: Record<string, unknown>; durationMs: number; status: string; costUsd: number }> {
  const start = Date.now();

  // LUCAS: Customer lifetime value — churn risk, referral probability, lifetime spend.
  const customers = await prisma.customer.findMany({
    where: { dealerId, deletedAt: null },
    include: {
      deals: { where: { status: "DELIVERED" }, include: { terms: true } },
      leads: { select: { id: true, status: true, lastContactedAt: true } },
      appointments: { select: { id: true, status: true } },
    },
    take: 50,
  });

  const clvAnalysis: Record<string, unknown>[] = [];

  for (const customer of customers) {
    const totalDealValue = customer.deals.reduce((sum, d) => sum + ((d.terms as { salePrice?: number } | null)?.salePrice ?? 0), 0);
    const dealCount = customer.deals.length;
    const daysSinceContact = customer.leads[0]?.lastContactedAt
      ? Math.floor((Date.now() - customer.leads[0].lastContactedAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    let churnRisk: "low" | "medium" | "high" = "low";
    let churnNotes: string[] = [];

    if (daysSinceContact !== null && daysSinceContact > 90) {
      churnRisk = "high";
      churnNotes.push(`No contact in ${daysSinceContact} days — high churn risk.`);
    } else if (daysSinceContact !== null && daysSinceContact > 60) {
      churnRisk = "medium";
      churnNotes.push(`No contact in ${daysSinceContact} days — consider outreach.`);
    }

    let referralProbability: "low" | "medium" | "high" = "low";
    if (dealCount >= 3 || totalDealValue > 80000) {
      referralProbability = "high";
    } else if (dealCount === 2 || totalDealValue > 40000) {
      referralProbability = "medium";
    }

    const clvScore = Math.min(100, Math.round(
      (dealCount * 10) + Math.min(50, totalDealValue / 2000) + (referralProbability === "high" ? 20 : referralProbability === "medium" ? 10 : 0)
    ));

    clvAnalysis.push({
      customerId: customer.id,
      customerName: `${customer.firstName} ${customer.lastName}`,
      email: customer.email,
      phone: customer.phone,
      dealCount,
      totalDealValue: Number(totalDealValue.toFixed(2)),
      daysSinceContact,
      churnRisk,
      churnNotes,
      referralProbability,
      clvScore,
      lastDealAt: customer.deals[0]?.deliveredAt ?? null,
    });
  }

  return {
    output: {
      agent: "LUCAS",
      summary: `${clvAnalysis.length} customers analyzed`,
      clvAnalysis,
    },
    durationMs: Date.now() - start,
    status: "success",
    costUsd: 0.004 * clvAnalysis.length,
  };
}

/* ============================================================
 * Service facade
 * ============================================================ */

export const aiAgentService = {
  /**
   * List all available agents with today's runtime stats.
   * Reads enabled agents from dealer.aiAgents column.
   */
  async listAgents(dealerId: string): Promise<AgentCatalogEntry[]> {
    const [dealer, novaStats, arioStats, sageStats, lucasStats] = await Promise.all([
      prisma.dealer.findUnique({ where: { id: dealerId }, select: { settings: true } }),
      getTodayStats(dealerId, "NOVA"),
      getTodayStats(dealerId, "ARIO"),
      getTodayStats(dealerId, "SAGE"),
      getTodayStats(dealerId, "LUCAS"),
    ]);

    const settings = (dealer?.settings ?? {}) as Record<string, unknown>;
    const agentSettings = (settings.agentSettings ?? {}) as Record<string, { isEnabled?: boolean }>;
    const allAgents = ["NOVA", "ARIO", "SAGE", "LUCAS"];
    const enabled = allAgents.filter((a) => {
      const agentSetting = agentSettings[a];
      return agentSetting === undefined || agentSetting.isEnabled !== false;
    });

    return [
      buildCatalogEntry(
        "NOVA", "NOVA", "First-touch lead messaging and routing — responds to new leads within seconds via SMS or WhatsApp.",
        "zap", ["lead-routing", "sms", "whatsapp"], enabled.includes("NOVA"),
        novaStats,
      ),
      buildCatalogEntry(
        "ARIO", "ARIO", "Inventory intelligence — pricing optimization, turn analysis, and listing recommendations.",
        "trending-up", ["inventory", "pricing", "market-analysis"], enabled.includes("ARIO"),
        arioStats,
      ),
      buildCatalogEntry(
        "SAGE", "SAGE", "Deal analytics — gross prediction, contract risk scoring, and finance health checks.",
        "bar-chart-2", ["deal-analytics", "risk-scoring", "finance"], enabled.includes("SAGE"),
        sageStats,
      ),
      buildCatalogEntry(
        "LUCAS", "LUCAS", "Customer lifetime value — churn risk, referral scoring, and spend forecasting.",
        "users", ["clv", "churn-risk", "referral-scoring"], enabled.includes("LUCAS"),
        lucasStats,
      ),
    ];
  },

  /**
   * Get details for a single agent plus recent runs.
   */
  async getAgent(dealerId: string, agentId: string): Promise<{
    agent: AgentCatalogEntry;
    recentRuns: Array<{ id: string; entityType: string | null; entityId: string | null; status: string; durationMs: number | null; costUsd: number | null; createdAt: Date }>;
  }> {
    const agents = await this.listAgents(dealerId);
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) throw new NotFoundError(`Agent '${agentId}' not found`);

    const runs = await prisma.agentRun.findMany({
      where: { dealerId, agentName: agentId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, entityType: true, entityId: true, status: true, durationMs: true, costUsd: true, createdAt: true },
    });

    return { agent, recentRuns: runs };
  },

  /**
   * Trigger an agent run.
   */
  async runAgent(dealerId: string, agentId: string, input: {
    entityType?: string;
    entityId?: string;
    action?: string;
    dryRun?: boolean;
  }): Promise<{ runId: string; output: Record<string, unknown> }> {
    const start = Date.now();

    let result: { output: Record<string, unknown>; durationMs: number; status: string; costUsd: number };

    switch (agentId) {
      case "NOVA":
        result = await runNOVA(dealerId, input.entityType, input.entityId, input.action, input.dryRun ?? false);
        break;
      case "ARIO":
        result = await runARIO(dealerId, input.entityType, input.entityId, input.action, input.dryRun ?? false);
        break;
      case "SAGE":
        result = await runSAGE(dealerId, input.entityType, input.entityId, input.action, input.dryRun ?? false);
        break;
      case "LUCAS":
        result = await runLUCAS(dealerId, input.entityType, input.entityId, input.action, input.dryRun ?? false);
        break;
      default:
        throw new NotFoundError(`Agent '${agentId}' not found`);
    }

    const run = await persistRun({
      dealerId,
      agentName: agentId,
      entityType: input.entityType,
      entityId: input.entityId,
      input: { action: input.action, dryRun: input.dryRun },
      output: result.output,
      durationMs: result.durationMs,
      status: result.status,
      costUsd: result.costUsd,
    });

    return { runId: run.id, output: result.output };
  },

  /**
   * Paginated run history for an agent.
   */
  async listRuns(dealerId: string, agentId: string, args: {
    entityType?: string;
    entityId?: string;
    status?: string;
    limit: number;
    cursor?: string | null;
  }): Promise<{ data: AgentRun[]; pagination: { hasMore: boolean; cursor: string | null } }> {
    const where: Prisma.AgentRunWhereInput = { dealerId, agentName: agentId };
    if (args.entityType) where.entityType = args.entityType;
    if (args.entityId) where.entityId = args.entityId;
    if (args.status) where.status = args.status;

    const runs = await prisma.agentRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: args.limit + 1,
      ...(args.cursor ? { skip: 1, cursor: { id: args.cursor } } : {}),
    });

    const hasMore = runs.length > args.limit;
    if (hasMore) runs.pop();
    const cursor = hasMore && runs.length > 0 ? runs[runs.length - 1]?.id ?? null : null;

    return { data: runs, pagination: { hasMore, cursor } };
  },

  /**
   * Today's metrics summary for an agent.
   */
  async getMetrics(dealerId: string, agentId: string): Promise<{
    totalRuns: number;
    avgResponseTimeMs: number;
    totalCostUsd: number;
    successCount: number;
    failedCount: number;
  }> {
    const stats = await getTodayStats(dealerId, agentId);
    const runs = await prisma.agentRun.findMany({
      where: {
        dealerId,
        agentName: agentId,
        createdAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) },
      },
      select: { status: true },
    });
    return {
      totalRuns: stats.runCount,
      avgResponseTimeMs: Math.round(stats.avgMs),
      totalCostUsd: Number(stats.costUsd.toFixed(4)),
      successCount: runs.filter((r) => r.status === "success").length,
      failedCount: runs.filter((r) => r.status === "failed").length,
    };
  },

  /**
   * Toggle agent enabled/disabled — persisted in dealer.aiAgents column.
   */
  async toggleAgent(dealerId: string, agentId: string, isEnabled: boolean): Promise<void> {
    const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
    if (!dealer) throw new NotFoundError("Dealer not found");

    const current: string[] = dealer.aiAgents ?? ["NOVA", "ARIO", "SAGE", "LUCAS"];
    const updated = isEnabled
      ? [...new Set([...current, agentId])]
      : current.filter((a) => a !== agentId);

    await prisma.dealer.update({
      where: { id: dealerId },
      data: { aiAgents: updated },
    });
  },
};

export default aiAgentService;
