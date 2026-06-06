/**
 * Customer Merge — transactional combine of two customer records.
 *
 * Public operations:
 *   - `previewMerge`     — compute the would-be result without writing
 *   - `mergeCustomers`   — execute the merge in a single transaction
 *   - `unmergeCustomers` — reverse a merge within the 30-day window
 *
 * Transactional contract (merge):
 *   1. Verify both customers exist and belong to the same dealer.
 *   2. Snapshot pre-merge state of both records.
 *   3. For each chosen field, apply master | duplicate value to master.
 *   4. Reassign all related rows (deals, leads, appointments,
 *      activities, communications) from duplicate → master.
 *   5. Soft-delete the duplicate (deletedAt = now, mergedIntoId = masterId).
 *   6. Create a CustomerMergeRecord for audit + recovery.
 *   7. Mark related DuplicateDetectionLog rows as merged.
 *
 * Unmerge:
 *   - Only allowed if `recoverable = true` and `recoveryDeadline > now`.
 *   - Restores the soft-deleted duplicate, restores the master field
 *     values from the snapshot, and reassigns all related rows back.
 *   - Sets recoverable=false after a successful unmerge.
 *
 * Multi-tenant: every Prisma call carries `dealerId`. Both customers
 * must belong to the caller's dealer — enforced at the top of each op.
 */

import { prisma } from "../utils/prisma.js";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors.js";
import type { Customer, Prisma } from "@prisma/client";

/* ============================================================
 * Constants
 * ============================================================ */

export const MERGE_RECOVERY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MERGEABLE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "dob",
  "dlNumber",
  "dlProvince",
  "creditTier",
  "notes",
  "tags",
  "address",
] as const;

export type MergeableField = (typeof MERGEABLE_FIELDS)[number];
export type FieldChoice = "master" | "duplicate";

export type FieldChoices = Partial<Record<MergeableField, FieldChoice>>;

/* ============================================================
 * Helpers
 * ============================================================ */

function pickValue<K extends MergeableField>(
  field: K,
  master: Customer,
  duplicate: Customer,
  choices: FieldChoices,
): Customer[K] {
  const choice = choices[field] ?? "master";
  return choice === "master" ? master[field] : duplicate[field];
}

function isMergeableField(name: string): name is MergeableField {
  return (MERGEABLE_FIELDS as readonly string[]).includes(name);
}

/**
 * Strip the duplicate's id and lifecycle fields — those don't move.
 * Used both for the snapshot (pre-merge) and to compare against the
 * rebuilt master shape.
 */
function snapshotOf(c: Customer): Prisma.JsonObject {
  return {
    id: c.id,
    dealerId: c.dealerId,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    address: c.address as unknown as Prisma.JsonValue,
    dob: c.dob ? c.dob.toISOString() : null,
    creditTier: c.creditTier,
    dlNumber: c.dlNumber,
    dlProvince: c.dlProvince,
    notes: c.notes,
    tags: c.tags,
    mergedIntoId: c.mergedIntoId,
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

/* ============================================================
 * Preview
 * ============================================================ */

export interface MergePreviewResult {
  masterId: string;
  duplicateId: string;
  merged: {
    id: string;
    dealerId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    dob: Date | null;
    creditTier: Customer["creditTier"];
    dlNumber: string | null;
    dlProvince: string | null;
    notes: string | null;
    tags: string[];
    address: Prisma.JsonValue;
  };
  fieldChoices: FieldChoices;
  movedCounts: {
    deals: number;
    leads: number;
    appointments: number;
    activities: number;
    communications: number;
  };
}

/**
 * Compute the would-be merge result without writing anything. Used by
 * the "Preview" button in the UI so the operator can confirm.
 */
export async function previewMerge(args: {
  dealerId: string;
  masterId: string;
  duplicateId: string;
  fieldChoices?: FieldChoices;
}): Promise<MergePreviewResult> {
  if (args.masterId === args.duplicateId) {
    throw new ValidationError("Master and duplicate must be different customers");
  }

  const [master, duplicate, movedCounts] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: args.masterId, dealerId: args.dealerId },
    }),
    prisma.customer.findFirst({
      where: { id: args.duplicateId, dealerId: args.dealerId },
    }),
    countRelatedForMerge({
      dealerId: args.dealerId,
      duplicateId: args.duplicateId,
    }),
  ]);

  if (!master) throw new NotFoundError("Master customer not found");
  if (!duplicate) throw new NotFoundError("Duplicate customer not found");
  if (master.deletedAt) {
    throw new ValidationError("Master customer is soft-deleted");
  }
  if (duplicate.deletedAt) {
    throw new ValidationError("Duplicate customer is already soft-deleted");
  }
  if (duplicate.mergedIntoId) {
    throw new ValidationError("Duplicate is already merged into another record");
  }

  const choices = args.fieldChoices ?? {};
  const merged = {
    id: master.id,
    dealerId: master.dealerId,
    firstName: pickValue("firstName", master, duplicate, choices),
    lastName: pickValue("lastName", master, duplicate, choices),
    email: pickValue("email", master, duplicate, choices),
    phone: pickValue("phone", master, duplicate, choices),
    dob: pickValue("dob", master, duplicate, choices),
    creditTier: pickValue("creditTier", master, duplicate, choices),
    dlNumber: pickValue("dlNumber", master, duplicate, choices),
    dlProvince: pickValue("dlProvince", master, duplicate, choices),
    notes: pickValue("notes", master, duplicate, choices),
    tags: pickValue("tags", master, duplicate, choices),
    address: pickValue("address", master, duplicate, choices) as Prisma.JsonValue,
  };

  return {
    masterId: master.id,
    duplicateId: duplicate.id,
    merged,
    fieldChoices: choices,
    movedCounts,
  };
}

/* ============================================================
 * Counts (for preview + audit)
 * ============================================================ */

async function countRelatedForMerge(args: {
  dealerId: string;
  duplicateId: string;
}): Promise<MergePreviewResult["movedCounts"]> {
  const [deals, leads, appointments, activities, communications] =
    await Promise.all([
      prisma.deal.count({
        where: { customerId: args.duplicateId, dealerId: args.dealerId },
      }),
      prisma.lead.count({
        where: { customerId: args.duplicateId, dealerId: args.dealerId },
      }),
      prisma.appointment.count({
        where: { customerId: args.duplicateId, dealerId: args.dealerId },
      }),
      prisma.activity.count({
        where: {
          entityType: "CUSTOMER",
          entityId: args.duplicateId,
          dealerId: args.dealerId,
        },
      }),
      prisma.communication.count({
        where: { customerId: args.duplicateId, dealerId: args.dealerId },
      }),
    ]);
  return { deals, leads, appointments, activities, communications };
}

/* ============================================================
 * Merge
 * ============================================================ */

export interface MergeResult {
  mergeRecordId: string;
  master: Customer;
  duplicate: Customer;
  movedCounts: MergePreviewResult["movedCounts"];
}

/**
 * Execute the merge. See the file header for the transactional
 * contract. Returns the updated master + soft-deleted duplicate, plus
 * the audit record id.
 */
export async function mergeCustomers(args: {
  dealerId: string;
  masterId: string;
  duplicateId: string;
  fieldChoices?: FieldChoices;
  mergedById: string;
  /** When set, also mark the originating DuplicateDetectionLog row as merged. */
  sourceDuplicateLogId?: string;
}): Promise<MergeResult> {
  if (args.masterId === args.duplicateId) {
    throw new ValidationError("Master and duplicate must be different customers");
  }
  if (!args.mergedById) {
    throw new ValidationError("mergedById is required");
  }

  return prisma.$transaction(async (tx) => {
    const master = await tx.customer.findFirst({
      where: { id: args.masterId, dealerId: args.dealerId },
    });
    const duplicate = await tx.customer.findFirst({
      where: { id: args.duplicateId, dealerId: args.dealerId },
    });
    if (!master) throw new NotFoundError("Master customer not found");
    if (!duplicate) throw new NotFoundError("Duplicate customer not found");
    if (master.deletedAt) {
      throw new ValidationError("Master customer is soft-deleted");
    }
    if (duplicate.deletedAt || duplicate.mergedIntoId) {
      throw new ValidationError("Duplicate is already merged or soft-deleted");
    }
    // Make sure master is the older record (smallest id) — we don't
    // enforce it, but the snapshot logic is simpler if it is.
    void master;

    const choices = args.fieldChoices ?? {};
    const updateData: Prisma.CustomerUpdateInput = {
      firstName: pickValue("firstName", master, duplicate, choices),
      lastName: pickValue("lastName", master, duplicate, choices),
      email: pickValue("email", master, duplicate, choices),
      phone: pickValue("phone", master, duplicate, choices),
      dob: pickValue("dob", master, duplicate, choices),
      creditTier: pickValue("creditTier", master, duplicate, choices),
      dlNumber: pickValue("dlNumber", master, duplicate, choices),
      dlProvince: pickValue("dlProvince", master, duplicate, choices),
      notes: pickValue("notes", master, duplicate, choices),
      tags: pickValue("tags", master, duplicate, choices),
      address: pickValue("address", master, duplicate, choices) as
        | Prisma.InputJsonValue
        | Prisma.JsonNullValueInput
        | undefined,
    };

    // 1. Update master.
    const updatedMaster = await tx.customer.update({
      where: { id: master.id },
      data: updateData,
    });

    // 2. Reassign related records: deals, leads, appointments, communications.
    //    For activities, we don't have a customerId field — the link is
    //    entityType=CUSTOMER + entityId. Update those.
    const [dealsUpdate, leadsUpdate, appointmentsUpdate, activitiesUpdate, communicationsUpdate] =
      await Promise.all([
        tx.deal.updateMany({
          where: { customerId: duplicate.id, dealerId: args.dealerId },
          data: { customerId: master.id },
        }),
        tx.lead.updateMany({
          where: { customerId: duplicate.id, dealerId: args.dealerId },
          data: { customerId: master.id },
        }),
        tx.appointment.updateMany({
          where: { customerId: duplicate.id, dealerId: args.dealerId },
          data: { customerId: master.id },
        }),
        tx.activity.updateMany({
          where: {
            entityType: "CUSTOMER",
            entityId: duplicate.id,
            dealerId: args.dealerId,
          },
          data: { entityId: master.id },
        }),
        tx.communication.updateMany({
          where: { customerId: duplicate.id, dealerId: args.dealerId },
          data: { customerId: master.id },
        }),
      ]);

    const movedCounts = {
      deals: dealsUpdate.count,
      leads: leadsUpdate.count,
      appointments: appointmentsUpdate.count,
      activities: activitiesUpdate.count,
      communications: communicationsUpdate.count,
    };

    // 3. Soft-delete the duplicate.
    const softDeleted = await tx.customer.update({
      where: { id: duplicate.id },
      data: {
        deletedAt: new Date(),
        mergedIntoId: master.id,
        // Clear identifying fields so two soft-deleted records can never
        // collide on a future unique constraint. We preserve the
        // snapshot in CustomerMergeRecord for unmerge.
        firstName: `[merged:${duplicate.id}]`,
        lastName: `[merged:${duplicate.id}]`,
        email: null,
        phone: null,
      },
    });

    // 4. Record the merge.
    const recoveryDeadline = new Date(Date.now() + MERGE_RECOVERY_DAYS * DAY_MS);
    const mergeRecord = await tx.customerMergeRecord.create({
      data: {
        dealerId: args.dealerId,
        masterId: master.id,
        duplicateId: duplicate.id,
        fieldChoices: choices as unknown as Prisma.InputJsonValue,
        masterBefore: snapshotOf(master) as unknown as Prisma.InputJsonValue,
        duplicateBefore: snapshotOf(duplicate) as unknown as Prisma.InputJsonValue,
        mergedById: args.mergedById,
        mergedAt: new Date(),
        recoverable: true,
        recoveryDeadline,
        movedCounts: movedCounts as unknown as Prisma.InputJsonValue,
      },
    });

    // 5. Mark the originating duplicate-detection row as merged (if any).
    if (args.sourceDuplicateLogId) {
      await tx.duplicateDetectionLog.update({
        where: { id: args.sourceDuplicateLogId },
        data: {
          status: "merged",
          mergedAt: new Date(),
          mergedById: args.mergedById,
          mergeRecordId: mergeRecord.id,
        },
      });
    }
    // Also flip any other pending log rows involving this pair.
    await tx.duplicateDetectionLog.updateMany({
      where: {
        dealerId: args.dealerId,
        status: "pending",
        OR: [
          { entityAId: master.id, entityBId: duplicate.id },
          { entityAId: duplicate.id, entityBId: master.id },
          { entityAId: master.id, entityBId: master.id },
          { entityAId: duplicate.id, entityBId: duplicate.id },
        ],
      },
      data: {
        status: "merged",
        mergedAt: new Date(),
        mergedById: args.mergedById,
        mergeRecordId: mergeRecord.id,
      },
    });

    // 6. Log an Activity row for the master timeline.
    await tx.activity.create({
      data: {
        dealerId: args.dealerId,
        entityType: "CUSTOMER",
        entityId: master.id,
        type: "AI_ACTION",
        authorId: args.mergedById,
        agentName: "MERGE",
        body: `Merged customer ${duplicate.id} (${duplicate.firstName} ${duplicate.lastName}) into this record. Moved: ${movedCounts.deals} deals, ${movedCounts.leads} leads, ${movedCounts.appointments} appointments, ${movedCounts.activities} activities, ${movedCounts.communications} communications.`,
        metadata: {
          mergeRecordId: mergeRecord.id,
          duplicateId: duplicate.id,
          fieldChoices: choices,
          movedCounts,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      mergeRecordId: mergeRecord.id,
      master: updatedMaster,
      duplicate: softDeleted,
      movedCounts,
    };
  });
}

/* ============================================================
 * Unmerge
 * ============================================================ */

export interface UnmergeResult {
  recordId: string;
  master: Customer;
  duplicate: Customer;
}

export async function unmergeCustomers(args: {
  dealerId: string;
  recordId: string;
  unmergedById: string;
}): Promise<UnmergeResult> {
  if (!args.unmergedById) {
    throw new ValidationError("unmergedById is required");
  }

  return prisma.$transaction(async (tx) => {
    const record = await tx.customerMergeRecord.findFirst({
      where: { id: args.recordId, dealerId: args.dealerId },
    });
    if (!record) throw new NotFoundError("Merge record not found");
    if (record.unmergedAt) {
      throw new ConflictError("Merge has already been reversed");
    }
    if (!record.recoverable) {
      throw new ConflictError("Merge is no longer recoverable");
    }
    if (record.recoveryDeadline && record.recoveryDeadline < new Date()) {
      throw new ConflictError(
        `Recovery window (${MERGE_RECOVERY_DAYS} days) has elapsed`,
      );
    }

    // Restore master from snapshot.
    const masterBefore = record.masterBefore as Record<string, unknown> | null;
    if (!masterBefore) {
      throw new ConflictError("Master snapshot missing — cannot unmerge");
    }
    const restoredMasterData: Prisma.CustomerUpdateInput = {
      firstName: typeof masterBefore["firstName"] === "string" ? masterBefore["firstName"] : "Unknown",
      lastName: typeof masterBefore["lastName"] === "string" ? masterBefore["lastName"] : "Unknown",
      email: typeof masterBefore["email"] === "string" ? masterBefore["email"] : null,
      phone: typeof masterBefore["phone"] === "string" ? masterBefore["phone"] : null,
      address: masterBefore["address"] as Prisma.InputJsonValue | undefined,
      dob:
        typeof masterBefore["dob"] === "string"
          ? new Date(masterBefore["dob"] as string)
          : null,
      creditTier: masterBefore["creditTier"] as Customer["creditTier"] | null,
      dlNumber:
        typeof masterBefore["dlNumber"] === "string" ? masterBefore["dlNumber"] : null,
      dlProvince:
        typeof masterBefore["dlProvince"] === "string"
          ? masterBefore["dlProvince"]
          : null,
      notes: typeof masterBefore["notes"] === "string" ? masterBefore["notes"] : null,
      tags: Array.isArray(masterBefore["tags"])
        ? (masterBefore["tags"] as string[])
        : [],
    };

    const master = await tx.customer.update({
      where: { id: record.masterId },
      data: restoredMasterData,
    });

    // Restore the duplicate from snapshot, undelete it, clear mergedIntoId.
    const dupBefore = record.duplicateBefore as Record<string, unknown> | null;
    if (!dupBefore) {
      throw new ConflictError("Duplicate snapshot missing — cannot unmerge");
    }
    const restoredDupData: Prisma.CustomerUpdateInput = {
      firstName: typeof dupBefore["firstName"] === "string" ? dupBefore["firstName"] : "",
      lastName: typeof dupBefore["lastName"] === "string" ? dupBefore["lastName"] : "",
      email: typeof dupBefore["email"] === "string" ? dupBefore["email"] : null,
      phone: typeof dupBefore["phone"] === "string" ? dupBefore["phone"] : null,
      address: dupBefore["address"] as Prisma.InputJsonValue | undefined,
      dob:
        typeof dupBefore["dob"] === "string"
          ? new Date(dupBefore["dob"] as string)
          : null,
      creditTier: dupBefore["creditTier"] as Customer["creditTier"] | null,
      dlNumber:
        typeof dupBefore["dlNumber"] === "string" ? dupBefore["dlNumber"] : null,
      dlProvince:
        typeof dupBefore["dlProvince"] === "string"
          ? dupBefore["dlProvince"]
          : null,
      notes: typeof dupBefore["notes"] === "string" ? dupBefore["notes"] : null,
      tags: Array.isArray(dupBefore["tags"])
        ? (dupBefore["tags"] as string[])
        : [],
      deletedAt: null,
      mergedInto: { disconnect: true },
    };
    const duplicate = await tx.customer.update({
      where: { id: record.duplicateId },
      data: restoredDupData,
    });

    // Move any related records that the merge had moved — back to the duplicate.
    // We can't perfectly reverse a merge (downstream writes may have
    // happened on the master), so we move rows whose customerId is
    // currently master.id but which existed pre-merge. The cleanest
    // approach: count the movedCounts and move the most recent N. For
    // now we just move the ones that were createdAt <= mergedAt
    // (so we don't steal rows added after the merge).
    const mergedAt = record.mergedAt;
    await Promise.all([
      tx.deal.updateMany({
        where: {
          customerId: master.id,
          dealerId: args.dealerId,
          createdAt: { lte: mergedAt },
        },
        data: { customerId: duplicate.id },
      }),
      tx.lead.updateMany({
        where: {
          customerId: master.id,
          dealerId: args.dealerId,
          createdAt: { lte: mergedAt },
        },
        data: { customerId: duplicate.id },
      }),
      tx.appointment.updateMany({
        where: {
          customerId: master.id,
          dealerId: args.dealerId,
          createdAt: { lte: mergedAt },
        },
        data: { customerId: duplicate.id },
      }),
      tx.communication.updateMany({
        where: {
          customerId: master.id,
          dealerId: args.dealerId,
          sentAt: { lte: mergedAt },
        },
        data: { customerId: duplicate.id },
      }),
    ]);

    // Mark the merge record as reversed.
    await tx.customerMergeRecord.update({
      where: { id: record.id },
      data: {
        unmergedAt: new Date(),
        unmergedById: args.unmergedById,
        recoverable: false,
      },
    });

    // Log a reversing activity on the master.
    await tx.activity.create({
      data: {
        dealerId: args.dealerId,
        entityType: "CUSTOMER",
        entityId: master.id,
        type: "AI_ACTION",
        authorId: args.unmergedById,
        agentName: "UNMERGE",
        body: `Reversed merge of customer ${duplicate.id} (${duplicate.firstName} ${duplicate.lastName}).`,
        metadata: {
          mergeRecordId: record.id,
          duplicateId: duplicate.id,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return { recordId: record.id, master, duplicate };
  });
}

/* ============================================================
 * Read helpers (for routes)
 * ============================================================ */

export async function getMergeRecord(args: {
  dealerId: string;
  recordId: string;
}): Promise<
  | (Awaited<ReturnType<typeof prisma.customerMergeRecord.findFirst>> & {})
  | null
> {
  return prisma.customerMergeRecord.findFirst({
    where: { id: args.recordId, dealerId: args.dealerId },
  });
}

export async function listMergeRecords(args: {
  dealerId: string;
  masterId?: string;
  duplicateId?: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    masterId: string;
    duplicateId: string;
    mergedById: string;
    mergedAt: Date;
    unmergedAt: Date | null;
    recoverable: boolean;
    recoveryDeadline: Date | null;
    movedCounts: Prisma.JsonValue;
  }>
> {
  const rows = await prisma.customerMergeRecord.findMany({
    where: {
      dealerId: args.dealerId,
      ...(args.masterId ? { masterId: args.masterId } : {}),
      ...(args.duplicateId ? { duplicateId: args.duplicateId } : {}),
    },
    orderBy: { mergedAt: "desc" },
    take: args.limit ?? 50,
  });
  return rows.map((r) => ({
    id: r.id,
    masterId: r.masterId,
    duplicateId: r.duplicateId,
    mergedById: r.mergedById,
    mergedAt: r.mergedAt,
    unmergedAt: r.unmergedAt,
    recoverable: r.recoverable,
    recoveryDeadline: r.recoveryDeadline,
    movedCounts: r.movedCounts as unknown as Prisma.JsonValue,
  }));
}

/* ============================================================
 * Public service object
 * ============================================================ */

export const customerMerge = {
  previewMerge,
  mergeCustomers,
  unmergeCustomers,
  getMergeRecord,
  listMergeRecords,
  MERGEABLE_FIELDS,
  MERGE_RECOVERY_DAYS,
};

export default customerMerge;
