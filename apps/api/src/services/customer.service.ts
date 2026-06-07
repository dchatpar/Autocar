/**
 * Customer Service — business logic for customer mutations.
 *
 * Wraps every mutation in `withAuditContext()` so an ActivityLog
 * row is written for the create / update / delete event. Merging
 * two customers is its own logged event (`customer.merged`).
 */

import { Prisma, type Customer } from "@prisma/client";

import { prisma as defaultPrisma } from "../utils/prisma.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { withAuditContext, logActivity, type AuditContext } from "./activity-logger.service.js";
import { realtimeService } from "./realtime.service.js";

export interface CreateCustomerInput {
  dealerId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: Prisma.InputJsonValue;
  dob?: Date | null;
  dlNumber?: string | null;
  dlProvince?: string | null;
  notes?: string | null;
  tags?: string[];
  creditTier?: "A" | "B" | "C" | "D" | "SUBPRIME" | null;
}

export interface UpdateCustomerInput {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  address?: Prisma.InputJsonValue;
  dob?: Date | null;
  dlNumber?: string | null;
  dlProvince?: string | null;
  notes?: string | null;
  tags?: string[];
  creditTier?: "A" | "B" | "C" | "D" | "SUBPRIME" | null;
}

export const customerService = {
  async create(
    ctx: AuditContext,
    input: CreateCustomerInput,
    actor?: { id: string; name?: string | null },
  ): Promise<Customer> {
    if (!input.firstName || !input.lastName) {
      throw new ValidationError("firstName and lastName are required");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const customer = await db.customer.create({
      data: {
        dealerId: input.dealerId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ? (input.address as Prisma.InputJsonValue) : Prisma.JsonNull,
        dob: input.dob ?? null,
        dlNumber: input.dlNumber ?? null,
        dlProvince: input.dlProvince ?? null,
        notes: input.notes ?? null,
        tags: input.tags ?? [],
        creditTier: input.creditTier ?? null,
      },
    });
    realtimeService.emitCustomerCreated(
      input.dealerId,
      {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
      },
      actor ? { id: actor.id, name: actor.name ?? null } : undefined,
    );
    return customer;
  },

  async update(
    ctx: AuditContext,
    dealerId: string,
    customerId: string,
    input: UpdateCustomerInput,
  ): Promise<Customer> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.customer.findFirst({
      where: { id: customerId, dealerId },
    });
    if (!existing) throw new NotFoundError("Customer not found");
    return db.customer.update({
      where: { id: customerId },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.address !== undefined
          ? { address: input.address ? (input.address as Prisma.InputJsonValue) : Prisma.JsonNull }
          : {}),
        ...(input.dob !== undefined ? { dob: input.dob } : {}),
        ...(input.dlNumber !== undefined ? { dlNumber: input.dlNumber } : {}),
        ...(input.dlProvince !== undefined ? { dlProvince: input.dlProvince } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.creditTier !== undefined ? { creditTier: input.creditTier } : {}),
      },
    });
  },

  /**
   * Merge two customer records into a single master. The duplicate is
   * deleted; the master retains its id and absorbs the duplicate's
   * fields where the master has none. Emits `customer.merged` with
   * a before-snapshot of the deleted record.
   */
  async merge(
    ctx: AuditContext,
    dealerId: string,
    masterId: string,
    duplicateId: string,
    actor: { role: string; id: string },
  ): Promise<Customer> {
    if (masterId === duplicateId) {
      throw new ValidationError("Cannot merge a customer with itself");
    }
    if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
      throw new ForbiddenError("Only admins and managers can merge customers");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const [master, duplicate] = await Promise.all([
      db.customer.findFirst({ where: { id: masterId, dealerId } }),
      db.customer.findFirst({ where: { id: duplicateId, dealerId } }),
    ]);
    if (!master) throw new NotFoundError("Master customer not found");
    if (!duplicate) throw new NotFoundError("Duplicate customer not found");

    // Merge the fields the master is missing. We never overwrite a
    // field the master already has, except for `tags` (additive).
    const merged = await db.customer.update({
      where: { id: masterId },
      data: {
        firstName: master.firstName || duplicate.firstName,
        lastName: master.lastName || duplicate.lastName,
        email: master.email ?? duplicate.email,
        phone: master.phone ?? duplicate.phone,
        address: (master.address ?? duplicate.address) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
        dob: master.dob ?? duplicate.dob,
        dlNumber: master.dlNumber ?? duplicate.dlNumber,
        dlProvince: master.dlProvince ?? duplicate.dlProvince,
        notes: [master.notes, duplicate.notes].filter(Boolean).join("\n---\n") || null,
        tags: Array.from(new Set([...(master.tags ?? []), ...(duplicate.tags ?? [])])),
        creditTier: master.creditTier ?? duplicate.creditTier,
      },
    });
    await db.customer.delete({ where: { id: duplicateId } });

    await logActivity(ctx, {
      action: "customer.merged",
      entityType: "customer",
      entityId: masterId,
      before: duplicate,
      after: {
        mergedFromId: duplicateId,
        absorbedFields: {
          email: !master.email && !!duplicate.email,
          phone: !master.phone && !!duplicate.phone,
          dlNumber: !master.dlNumber && !!duplicate.dlNumber,
        },
      },
      metadata: { masterId, duplicateId, mergedBy: actor.id },
    });

    return merged;
  },

  async delete(
    ctx: AuditContext,
    dealerId: string,
    customerId: string,
    actor: { role: string },
  ): Promise<Customer> {
    if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
      throw new ForbiddenError("Only admins and managers can delete customers");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.customer.findFirst({
      where: { id: customerId, dealerId },
    });
    if (!existing) throw new NotFoundError("Customer not found");
    return db.customer.delete({ where: { id: customerId } });
  },

  /**
   * Idempotent upsert used by public forms (website contact,
   * finance application). Looks up an existing customer by
   * (dealerId, email) or (dealerId, phone) and either returns it
   * or creates a new row. Designed to be called inside a
   * transaction so the caller can also create a Lead in the same
   * atomic operation.
   *
   * Accepts either a Prisma transaction client (`PrismaClient`
   * shaped) or the default client so the marketing-app flow can
   * roll back on error.
   */
  async upsertFromPublicForm(
    db: Prisma.TransactionClient | typeof defaultPrisma,
    input: {
      dealerId: string;
      firstName: string;
      lastName: string;
      email?: string | null;
      phone?: string | null;
      dob?: Date;
      address?: Prisma.InputJsonValue;
      notes?: string | null;
    },
  ): Promise<Customer> {
    if (!input.firstName || !input.lastName) {
      throw new ValidationError("firstName and lastName are required");
    }
    const normalisedEmail = input.email?.toLowerCase().trim() || null;
    const normalisedPhone = input.phone?.trim() || null;

    // Find an existing match. Email is the strongest key, then phone.
    const existing = await db.customer.findFirst({
      where: {
        dealerId: input.dealerId,
        deletedAt: null,
        OR: [
          ...(normalisedEmail ? [{ email: normalisedEmail }] : []),
          ...(normalisedPhone ? [{ phone: normalisedPhone }] : []),
        ],
      },
    });

    if (existing) {
      // Don't overwrite populated fields. Only fill in the gaps
      // (and append to notes). The new lead's source meta will
      // tie the two events together.
      return db.customer.update({
        where: { id: existing.id },
        data: {
          ...(existing.firstName ? {} : { firstName: input.firstName }),
          ...(existing.lastName ? {} : { lastName: input.lastName }),
          ...(!existing.email && normalisedEmail ? { email: normalisedEmail } : {}),
          ...(!existing.phone && normalisedPhone ? { phone: normalisedPhone } : {}),
          ...(existing.dob ? {} : input.dob ? { dob: input.dob } : {}),
          ...(!existing.address && input.address ? { address: input.address } : {}),
          ...(input.notes
            ? {
                notes: existing.notes
                  ? `${existing.notes}\n---\n${input.notes}`
                  : input.notes,
              }
            : {}),
        },
      });
    }

    return db.customer.create({
      data: {
        dealerId: input.dealerId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: normalisedEmail,
        phone: normalisedPhone,
        dob: input.dob ?? null,
        address: input.address ?? Prisma.JsonNull,
        notes: input.notes ?? null,
        tags: ["website_form"],
      },
    });
  },
};
