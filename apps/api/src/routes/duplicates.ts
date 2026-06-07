/**
 * Duplicate Detection & Merge routes — mounted at /customers/* and
 * /leads/:id/find-duplicates.
 *
 * Endpoints (all tenant-scoped via request.tenant.dealerId):
 *   POST /customers/:id/find-duplicates      — find duplicates for one customer
 *   POST /customers/merge/preview            — preview a merge (no writes)
 *   POST /customers/merge                    — execute a merge
 *   POST /customers/merge/:recordId/unmerge  — reverse within 30 days
 *   GET  /customers/duplicates               — list pending/merged/dismissed
 *   POST /customers/:id/dismiss-duplicate/:otherId
 *
 *   POST /leads/:id/find-duplicates          — find duplicates for a lead
 *
 * All routes require authenticate + tenant context. Merge + unmerge
 * are ADMIN / MANAGER only (the data is destructive).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Customer, Prisma } from "@prisma/client";

import { prisma } from "../utils/prisma.js";
import { validateBody, validateQuery } from "../utils/validate.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { duplicateDetector } from "../services/duplicate-detector.service.js";
import { customerMerge } from "../services/customer-merge.service.js";
import {
  DismissParamsSchema,
  FindDuplicatesQuerySchema,
  LeadFindDuplicatesQuerySchema,
  ListDuplicatesQuerySchema,
  MergeRequestSchema,
  PreviewMergeRequestSchema,
} from "../schemas/duplicate.schema.js";

/* ============================================================
 * Helpers — record shape conversion for the API
 * ============================================================ */

function customerToMatchable(c: Customer): {
  id: string;
  dealerId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: Prisma.JsonValue | null;
} {
  return {
    id: c.id,
    dealerId: c.dealerId,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    address: c.address as unknown as Prisma.JsonValue,
  };
}

function serializeCustomer(c: Customer): Record<string, unknown> {
  return {
    id: c.id,
    dealerId: c.dealerId,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    address: c.address,
    dob: c.dob ? c.dob.toISOString() : null,
    creditTier: c.creditTier,
    dlNumber: c.dlNumber,
    dlProvince: c.dlProvince,
    notes: c.notes,
    tags: c.tags,
    mergedIntoId: c.mergedIntoId,
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/* ============================================================
 * Routes
 * ============================================================ */

export async function duplicateRoutes(app: FastifyInstance): Promise<void> {
  /* ============================================================
   * POST /customers/:id/find-duplicates
   * ============================================================ */
  app.post(
    "/:id/find-duplicates",
    {
      preHandler: [
        app.authenticate,
        validateQuery(FindDuplicatesQuerySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const dealerId = request.tenant.dealerId;
      const q = (request as { validatedQuery?: z.infer<typeof FindDuplicatesQuerySchema> })
        .validatedQuery ?? {};

      const customer = await prisma.customer.findFirst({
        where: { id, dealerId },
      });
      if (!customer) throw new NotFoundError("Customer not found");

      const result = await duplicateDetector.findDuplicatesForCustomer(
        customerToMatchable(customer),
        {
          limit: q.limit,
          minScore: q.minScore,
        },
      );

      // Persist any auto_merge/flag results (idempotent on pair).
      const persisted: string[] = [];
      for (const m of result.matches) {
        if (m.classification === "not_duplicate") continue;
        const log = await duplicateDetector.logDuplicate({
          dealerId,
          entityType: "customer",
          entityAId: customer.id,
          entityBId: m.customer.id,
          score: m.score,
          reasons: m.reasons,
          classification: m.classification,
        });
        persisted.push(log.id);
      }

      return reply.status(200).send({
        data: {
          source: {
            id: customer.id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email,
            phone: customer.phone,
          },
          matches: result.matches.map((m) => ({
            customer: serializeCustomer(m.customer),
            score: m.score,
            reasons: m.reasons,
            classification: m.classification,
          })),
          candidatesScanned: result.candidatesScanned,
          durationMs: result.durationMs,
          persistedLogIds: persisted,
        },
      });
    },
  );

  /* ============================================================
   * POST /customers/merge/preview
   * ============================================================ */
  app.post(
    "/merge/preview",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER", "SALES"]),
        validateBody(PreviewMergeRequestSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as z.infer<typeof PreviewMergeRequestSchema>;
      const result = await customerMerge.previewMerge({
        dealerId: request.tenant.dealerId,
        masterId: body.masterId,
        duplicateId: body.duplicateId,
        fieldChoices: body.fieldChoices,
      });
      return reply.status(200).send({
        data: {
          ...result,
          merged: {
            ...result.merged,
            dob: result.merged.dob
              ? (result.merged.dob as Date).toISOString()
              : null,
          },
        },
      });
    },
  );

  /* ============================================================
   * POST /customers/merge
   * ============================================================ */
  app.post(
    "/merge",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER", "SALES"]),
        validateBody(MergeRequestSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as z.infer<typeof MergeRequestSchema>;
      const result = await customerMerge.mergeCustomers({
        dealerId: request.tenant.dealerId,
        masterId: body.masterId,
        duplicateId: body.duplicateId,
        fieldChoices: body.fieldChoices,
        mergedById: request.tenant.userId,
      });
      return reply.status(200).send({
        data: {
          mergeRecordId: result.mergeRecordId,
          master: serializeCustomer(result.master),
          duplicate: serializeCustomer(result.duplicate),
          movedCounts: result.movedCounts,
        },
      });
    },
  );

  /* ============================================================
   * POST /customers/merge/:recordId/unmerge
   * ============================================================ */
  app.post(
    "/merge/:recordId/unmerge",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { recordId } = request.params as { recordId: string };
      const result = await customerMerge.unmergeCustomers({
        dealerId: request.tenant.dealerId,
        recordId,
        unmergedById: request.tenant.userId,
      });
      return reply.status(200).send({
        data: {
          recordId: result.recordId,
          master: serializeCustomer(result.master),
          duplicate: serializeCustomer(result.duplicate),
        },
      });
    },
  );

  /* ============================================================
   * GET /customers/duplicates
   * ============================================================ */
  app.get(
    "/duplicates",
    {
      preHandler: [
        app.authenticate,
        validateQuery(ListDuplicatesQuerySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = (request as { validatedQuery?: z.infer<typeof ListDuplicatesQuerySchema> })
        .validatedQuery ?? { limit: 50 };

      const rows = await duplicateDetector.listDuplicates({
        dealerId: request.tenant.dealerId,
        status: q.status,
        classification: q.classification,
        limit: q.limit,
      });

      if (rows.length === 0) {
        return reply.status(200).send({ data: [], pagination: { hasMore: false } });
      }

      // Hydrate the customer records for both sides of each pair.
      const customerIds = Array.from(
        new Set(
          rows.flatMap((r) => [r.entityAId, r.entityBId]),
        ),
      );
      const customers = await prisma.customer.findMany({
        where: {
          dealerId: request.tenant.dealerId,
          id: { in: customerIds },
        },
      });
      const customerMap = new Map(customers.map((c) => [c.id, c]));

      return reply.status(200).send({
        data: rows.map((r) => ({
          id: r.id,
          entityType: r.entityType,
          score: r.score,
          reasons: r.reasons,
          classification: r.classification,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          entityA: customerMap.get(r.entityAId)
            ? serializeCustomer(customerMap.get(r.entityAId)!)
            : null,
          entityB: customerMap.get(r.entityBId)
            ? serializeCustomer(customerMap.get(r.entityBId)!)
            : null,
        })),
        pagination: { hasMore: rows.length === q.limit },
      });
    },
  );

  /* ============================================================
   * POST /customers/:id/dismiss-duplicate/:otherId
   * Marks the (id, otherId) pair as dismissed. Idempotent.
   * ============================================================ */
  app.post(
    "/:id/dismiss-duplicate/:otherId",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = DismissParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError("Invalid id pair");
      }
      const { id, otherId } = params.data;
      const dealerId = request.tenant.dealerId;

      // Normalize order to match the detector's convention.
      const [a, b] = id < otherId ? [id, otherId] : [otherId, id];

      // Find an existing pending log row for this pair, or create a
      // dismissed stub.
      const existing = await prisma.duplicateDetectionLog.findFirst({
        where: {
          dealerId,
          entityType: "customer",
          entityAId: a,
          entityBId: b,
        },
      });

      let logId: string;
      if (existing) {
        const updated = await prisma.duplicateDetectionLog.update({
          where: { id: existing.id },
          data: {
            status: "dismissed",
            dismissedAt: new Date(),
            dismissedById: request.tenant.userId,
          },
          select: { id: true },
        });
        logId = updated.id;
      } else {
        const created = await prisma.duplicateDetectionLog.create({
          data: {
            dealerId,
            entityType: "customer",
            entityAId: a,
            entityBId: b,
            score: 0,
            reasons: ["manually dismissed"] as unknown as Prisma.InputJsonValue,
            classification: "not_duplicate",
            status: "dismissed",
            dismissedAt: new Date(),
            dismissedById: request.tenant.userId,
          },
          select: { id: true },
        });
        logId = created.id;
      }
      return reply.status(200).send({ data: { id: logId, status: "dismissed" } });
    },
  );
}

/* ============================================================
 * Lead find-duplicates
 * ============================================================ */

export async function leadDuplicateRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/:id/find-duplicates",
    {
      preHandler: [
        app.authenticate,
        validateQuery(LeadFindDuplicatesQuerySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const dealerId = request.tenant.dealerId;
      const q = (request as { validatedQuery?: z.infer<typeof LeadFindDuplicatesQuerySchema> })
        .validatedQuery ?? {};

      const lead = await prisma.lead.findFirst({
        where: { id, dealerId },
      });
      if (!lead) throw new NotFoundError("Lead not found");

      const result = await duplicateDetector.findDuplicatesForLead(
        lead,
        { limit: q.limit, minScore: q.minScore },
      );

      // Persist findings.
      for (const m of result.matches) {
        if (m.classification === "not_duplicate") continue;
        await duplicateDetector.logDuplicate({
          dealerId,
          entityType: "customer",
          entityAId: lead.id,
          entityBId: m.customer.id,
          score: m.score,
          reasons: m.reasons,
          classification: m.classification,
        });
      }

      return reply.status(200).send({
        data: {
          source: {
            id: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName,
            email: lead.email,
            phone: lead.phone,
          },
          matches: result.matches.map((m) => ({
            customer: serializeCustomer(m.customer),
            score: m.score,
            reasons: m.reasons,
            classification: m.classification,
          })),
          candidatesScanned: result.candidatesScanned,
          durationMs: result.durationMs,
        },
      });
    },
  );
}
