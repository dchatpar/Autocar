/**
 * Dashboard KPI route — /api/dashboard/kpis
 *
 * Returns the at-a-glance metrics used by both the web dashboard
 * and the mobile home screen. All queries are tenant-scoped.
 *
 * The data is cheap to compute (a handful of COUNTs on indexed
 * columns), so we don't bother with Redis caching. The frontend
 * already caches for 60s via React Query.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../utils/prisma.js";
import type { UserRole } from "@prisma/client";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/kpis",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const dealerId = payload.dealerId;

      const now = Date.now();
      const startOfDay = new Date(now - ONE_DAY_MS);
      const startOfWeek = new Date(now - ONE_WEEK_MS);

      const [
        leadsToday,
        leadsThisWeek,
        hotLeads,
        inventoryCount,
        pendingDeals,
        wonThisWeek,
        totalLeadsThisWeek,
      ] = await Promise.all([
        prisma.lead.count({
          where: { dealerId, createdAt: { gte: startOfDay } },
        }),
        prisma.lead.count({
          where: { dealerId, createdAt: { gte: startOfWeek } },
        }),
        prisma.lead.count({
          where: { dealerId, score: { gte: 75 } },
        }),
        prisma.vehicle.count({
          where: { dealerId, status: "AVAILABLE" },
        }),
        prisma.deal.count({
          where: { dealerId, status: "PENDING_FINANCE" },
        }),
        prisma.deal.count({
          where: { dealerId, status: "DELIVERED", deliveredAt: { gte: startOfWeek } },
        }),
        prisma.lead.count({
          where: { dealerId, createdAt: { gte: startOfWeek } },
        }),
      ]);

      const conversionRate =
        totalLeadsThisWeek > 0
          ? Math.min(1, wonThisWeek / totalLeadsThisWeek)
          : 0;

      return reply.status(200).send({
        data: {
          leadsToday,
          leadsThisWeek,
          hotLeads,
          inventoryCount,
          pendingDeals,
          conversionRate,
        },
      });
    },
  );
}
