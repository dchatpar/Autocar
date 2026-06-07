/**
 * Customer routes — /api/v1/customers/*
 *
 * Full CRUD + entity-specific actions:
 *   POST   /customers                    — create
 *   GET    /customers                    — list (filterable, paginated)
 *   GET    /customers/:id                — get one
 *   PUT    /customers/:id                — update
 *   POST   /customers/:id/vehicle        — add vehicle to customer
 *   GET    /customers/:id/timeline       — activity timeline
 *   GET    /customers/:id/credits        — BHPH credit info
 *   POST   /customers/:id/convert-from-lead — merge+convert lead
 *   DELETE /customers/:id                — soft delete (admin/manager)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { validateBody, validateParams, validateQuery } from "../utils/validate.js";
import { customerService } from "../services/customer.service.js";
import { prisma } from "../utils/prisma.js";
import { NotFoundError } from "../utils/errors.js";

/* ============================================================
 * Schemas
 * ============================================================ */

const CustomerIdParamSchema = z.object({ id: z.string().min(1, "Customer id is required") });

const CreateCustomerBodySchema = z.object({
  firstName: z.string().trim().min(1, "firstName is required").max(60),
  lastName: z.string().trim().min(1, "lastName is required").max(60),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  phone: z.string().trim().min(7).max(32).optional().nullable(),
  address: z.record(z.unknown()).optional(),
  dob: z.string().datetime().optional().nullable(),
  dlNumber: z.string().trim().max(40).optional().nullable(),
  dlProvince: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  creditTier: z.enum(["A", "B", "C", "D", "SUBPRIME"]).optional(),
});

const UpdateCustomerBodySchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  phone: z.string().trim().min(7).max(32).optional().nullable(),
  address: z.record(z.unknown()).optional(),
  dob: z.string().datetime().optional().nullable(),
  dlNumber: z.string().trim().max(40).optional().nullable(),
  dlProvince: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  creditTier: z.enum(["A", "B", "C", "D", "SUBPRIME"]).optional(),
});

const ListCustomersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  creditTier: z.enum(["A", "B", "C", "D", "SUBPRIME"]).optional(),
  tags: z.string().optional(), // comma-separated
});

const AddVehicleToCustomerBodySchema = z.object({
  vehicleId: z.string().min(1, "vehicleId is required"),
});

const ConvertFromLeadBodySchema = z.object({
  leadId: z.string().min(1, "leadId is required"),
});

/* ============================================================
 * Helpers
 * ============================================================ */

function requireTenant(
  request: { tenant?: { dealerId: string; userId: string; role: string } | null },
): { dealerId: string; userId: string; role: string } {
  if (!request.tenant) throw new NotFoundError("Tenant context required");
  return request.tenant;
}

function toAuditContext(request: FastifyRequest) {
  const ctx = requireTenant(request);
  return {
    userId: ctx.userId,
    dealerId: ctx.dealerId,
    role: ctx.role,
    ipAddress: request.requestContext?.ipAddress ?? null,
    userAgent: request.requestContext?.userAgent ?? null,
    requestId: request.requestContext?.requestId ?? null,
  };
}

/* ============================================================
 * Routes
 * ============================================================ */

export async function customersRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /customers — create a new customer.
   */
  app.post(
    "/",
    {
      preHandler: [app.authenticate, validateBody(CreateCustomerBodySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const body = request.body as z.infer<typeof CreateCustomerBodySchema>;
      const { dealerId } = requireTenant(request);

      const customer = await customerService.create(ctx, {
        dealerId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: (body.address ?? undefined) as Prisma.InputJsonValue | undefined,
        dob: body.dob ? new Date(body.dob) : null,
        dlNumber: body.dlNumber ?? null,
        dlProvince: body.dlProvince ?? null,
        notes: body.notes ?? null,
        tags: body.tags,
        creditTier: body.creditTier ?? null,
      });

      return reply.status(201).send({ data: serializeCustomer(customer) });
    },
  );

  /**
   * GET /customers — list customers with filters and cursor pagination.
   */
  app.get(
    "/",
    {
      preHandler: [app.authenticate, validateQuery(ListCustomersQuerySchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dealerId } = requireTenant(request);
      const q = (request as { validatedQuery?: z.infer<typeof ListCustomersQuerySchema> })
        .validatedQuery as z.infer<typeof ListCustomersQuerySchema>;

      const where: Prisma.CustomerWhereInput = { dealerId, deletedAt: null };

      if (q.search) {
        const s = q.search.trim();
        where.OR = [
          { firstName: { contains: s, mode: "insensitive" } },
          { lastName: { contains: s, mode: "insensitive" } },
          { email: { contains: s, mode: "insensitive" } },
          { phone: { contains: s, mode: "insensitive" } },
        ];
      }
      if (q.creditTier) where.creditTier = q.creditTier;
      if (q.tags) {
        const tagList = q.tags.split(",").map((t) => t.trim()).filter(Boolean);
        if (tagList.length > 0) {
          where.tags = { hasSome: tagList };
        }
      }

      const rows = await prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > q.limit;
      const items = hasMore ? rows.slice(0, q.limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return reply.status(200).send({
        data: items.map(serializeCustomer),
        pagination: { hasMore, cursor: nextCursor },
      });
    },
  );

  /**
   * GET /customers/:id — get a single customer.
   */
  app.get(
    "/:id",
    {
      preHandler: [app.authenticate, validateParams(CustomerIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dealerId } = requireTenant(request);
      const { id } = request.params as z.infer<typeof CustomerIdParamSchema>;

      const customer = await prisma.customer.findFirst({
        where: { id, dealerId, deletedAt: null },
      });
      if (!customer) throw new NotFoundError("Customer not found");

      return reply.status(200).send({ data: serializeCustomer(customer) });
    },
  );

  /**
   * PUT /customers/:id — full update.
   */
  app.put(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        validateParams(CustomerIdParamSchema),
        validateBody(UpdateCustomerBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof CustomerIdParamSchema>;
      const body = request.body as z.infer<typeof UpdateCustomerBodySchema>;
      const { dealerId } = requireTenant(request);

      const updated = await customerService.update(ctx, dealerId, id, {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        address: (body.address ?? undefined) as Prisma.InputJsonValue | undefined,
        dob: body.dob ? new Date(body.dob) : null,
        dlNumber: body.dlNumber,
        dlProvince: body.dlProvince,
        notes: body.notes,
        tags: body.tags,
        creditTier: body.creditTier,
      });

      return reply.status(200).send({ data: serializeCustomer(updated) });
    },
  );

  /**
   * POST /customers/:id/vehicle — add a vehicle to a customer (link).
   */
  app.post(
    "/:id/vehicle",
    {
      preHandler: [
        app.authenticate,
        validateParams(CustomerIdParamSchema),
        validateBody(AddVehicleToCustomerBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof CustomerIdParamSchema>;
      const body = request.body as z.infer<typeof AddVehicleToCustomerBodySchema>;
      const { dealerId } = requireTenant(request);

      // Verify customer exists
      const customer = await prisma.customer.findFirst({
        where: { id, dealerId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) throw new NotFoundError("Customer not found");

      // Verify vehicle belongs to this dealer
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: body.vehicleId, dealerId },
        select: { id: true, vin: true, make: true, model: true, year: true },
      });
      if (!vehicle) throw new NotFoundError("Vehicle not found");

      // Create a deal linking customer + vehicle
      const deal = await prisma.deal.create({
        data: {
          dealerId,
          customerId: id,
          vehicleId: body.vehicleId,
          status: "WORKING",
          dealType: "RETAIL",
        },
      });

      const { logActivity } = await import("../services/activity-logger.service.js");
      await logActivity(ctx, {
        action: "deal.linked_to_customer",
        entityType: "deal",
        entityId: deal.id,
        after: { customerId: id, vehicleId: body.vehicleId },
      });

      return reply.status(201).send({
        data: {
          dealId: deal.id,
          vehicle: {
            id: vehicle.id,
            vin: vehicle.vin,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
          },
        },
      });
    },
  );

  /**
   * GET /customers/:id/timeline — activity timeline for the customer.
   */
  app.get(
    "/:id/timeline",
    {
      preHandler: [app.authenticate, validateParams(CustomerIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as z.infer<typeof CustomerIdParamSchema>;
      const { dealerId } = requireTenant(request);

      const customer = await prisma.customer.findFirst({
        where: { id, dealerId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) throw new NotFoundError("Customer not found");

      const activities = await prisma.activity.findMany({
        where: { dealerId, entityType: "CUSTOMER", entityId: id },
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true } } },
      });

      return reply.status(200).send({
        data: activities.map((a) => ({
          id: a.id,
          type: a.type,
          body: a.body,
          metadata: a.metadata,
          author: a.author ? { id: a.author.id, name: a.author.name } : null,
          createdAt: a.createdAt.toISOString(),
        })),
      });
    },
  );

  /**
   * GET /customers/:id/credits — BHPH credit info.
   * Returns all BHPH contracts and payment history for this customer.
   */
  app.get(
    "/:id/credits",
    {
      preHandler: [app.authenticate, validateParams(CustomerIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as z.infer<typeof CustomerIdParamSchema>;
      const { dealerId } = requireTenant(request);

      const customer = await prisma.customer.findFirst({
        where: { id, dealerId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) throw new NotFoundError("Customer not found");

      // Get all deals with BHPH contracts for this customer
      const bhphContracts = await prisma.bhphContract.findMany({
        where: { dealerId, deal: { customerId: id } },
        include: {
          payments: {
            orderBy: { dueDate: "asc" },
          },
          deal: {
            select: {
              id: true,
              vehicle: {
                select: { id: true, make: true, model: true, year: true, vin: true },
              },
            },
          },
        },
      });

      const contracts = bhphContracts.map((c) => {
        const totalPaid = c.payments.reduce((sum, p) => sum + (p.amountPaid ?? 0), 0);
        const totalDue = c.payments.reduce((sum, p) => sum + p.amountDue, 0);
        const paymentsMade = c.payments.filter((p) => p.status === "paid").length;
        const onTimePayments = c.payments.filter(
          (p) => p.status === "paid" && p.paidDate !== null && p.paidDate <= p.dueDate,
        ).length;
        return {
          id: c.id,
          dealId: c.dealId,
          principal: c.principal,
          rate: c.rate,
          termMonths: c.termMonths,
          paymentAmount: c.paymentAmount,
          paymentDay: c.paymentDay,
          firstPayment: c.firstPayment.toISOString(),
          maturityDate: c.maturityDate.toISOString(),
          totalPayments: c.totalPayments,
          status: c.status,
          vehicle: c.deal.vehicle,
          summary: {
            totalPaid,
            totalDue,
            balanceRemaining: Math.max(0, totalDue - totalPaid),
            paymentsMade,
            totalPayments: c.payments.length,
            onTimePayments,
            latePayments: paymentsMade - onTimePayments,
          },
          payments: c.payments.map((p) => ({
            id: p.id,
            dueDate: p.dueDate.toISOString(),
            paidDate: p.paidDate?.toISOString() ?? null,
            amountDue: p.amountDue,
            amountPaid: p.amountPaid,
            principalPortion: p.principalPortion,
            interestPortion: p.interestPortion,
            balanceAfter: p.balanceAfter,
            method: p.method,
            status: p.status,
          })),
        };
      });

      return reply.status(200).send({ data: { creditTier: null, contracts } });
    },
  );

  /**
   * POST /customers/:id/convert-from-lead — merge lead into customer.
   * Absorbs lead data into the existing customer record.
   */
  app.post(
    "/:id/convert-from-lead",
    {
      preHandler: [
        app.authenticate,
        validateParams(CustomerIdParamSchema),
        validateBody(ConvertFromLeadBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof CustomerIdParamSchema>;
      const body = request.body as z.infer<typeof ConvertFromLeadBodySchema>;
      const { dealerId } = requireTenant(request);

      // Verify customer exists
      const customer = await prisma.customer.findFirst({
        where: { id, dealerId, deletedAt: null },
      });
      if (!customer) throw new NotFoundError("Customer not found");

      // Verify lead exists and belongs to this dealer
      const lead = await prisma.lead.findFirst({
        where: { id: body.leadId, dealerId },
      });
      if (!lead) throw new NotFoundError("Lead not found");

      // Absorb missing fields from lead into customer
      const updated = await prisma.customer.update({
        where: { id },
        data: {
          firstName: customer.firstName || lead.firstName,
          lastName: customer.lastName || lead.lastName,
          email: customer.email ?? lead.email,
          phone: customer.phone ?? lead.phone,
          notes: [
            customer.notes,
            `[Converted from lead ${lead.id}] Source: ${lead.source ?? "unknown"}`,
          ]
            .filter(Boolean)
            .join("\n---\n"),
          tags: {
            push: [`converted-from-lead:${lead.source ?? "unknown"}`],
          },
        },
      });

      // Link the lead to this customer and update its status
      await prisma.lead.update({
        where: { id: body.leadId },
        data: { customerId: id, status: "DEAL" },
      });

      const { logActivity } = await import("../services/activity-logger.service.js");
      await logActivity(ctx, {
        action: "customer.lead_converted",
        entityType: "customer",
        entityId: id,
        after: { leadId: body.leadId, absorbedFields: { email: !customer.email, phone: !customer.phone } },
      });

      return reply.status(200).send({
        data: {
          customerId: id,
          leadId: body.leadId,
          customer: {
            id: updated.id,
            firstName: updated.firstName,
            lastName: updated.lastName,
            email: updated.email,
            phone: updated.phone,
          },
        },
      });
    },
  );

  /**
   * DELETE /customers/:id — soft delete (admin/manager only).
   */
  app.delete(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateParams(CustomerIdParamSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = toAuditContext(request);
      const { id } = request.params as z.infer<typeof CustomerIdParamSchema>;
      const { dealerId, role } = requireTenant(request);

      await customerService.delete(ctx, dealerId, id, { role });
      return reply.status(204).send();
    },
  );
}

/* ============================================================
 * Serialization helpers
 * ============================================================ */

function serializeCustomer(customer: {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: unknown;
  dob: Date | null;
  dlNumber: string | null;
  dlProvince: string | null;
  notes: string | null;
  tags: string[];
  creditTier: string | null;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}): {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: unknown;
  dob: string | null;
  dlNumber: string | null;
  dlProvince: string | null;
  notes: string | null;
  tags: string[];
  creditTier: string | null;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    dob: customer.dob instanceof Date ? customer.dob.toISOString() : (customer.dob as string | null),
    dlNumber: customer.dlNumber,
    dlProvince: customer.dlProvince,
    notes: customer.notes,
    tags: customer.tags,
    creditTier: customer.creditTier as string | null,
    createdAt: customer.createdAt instanceof Date ? customer.createdAt.toISOString() : String(customer.createdAt),
    updatedAt: customer.updatedAt instanceof Date ? customer.updatedAt.toISOString() : String(customer.updatedAt),
  };
}
