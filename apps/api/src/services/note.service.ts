/**
 * Note Service — polymorphic notes attached to any CRM entity.
 *
 * Notes are tied to a user and dealer. The `entityType` field
 * allows the same table to store notes for leads, customers,
 * vehicles, and deals without separate tables.
 *
 * Wraps mutations in withAuditContext() for the audit trail.
 */

import { prisma as defaultPrisma } from "../utils/prisma.js";
import { NotFoundError } from "../utils/errors.js";
import { withAuditContext, type AuditContext } from "./activity-logger.service.js";

export type NoteEntityType = "lead" | "customer" | "vehicle" | "deal";

export interface CreateNoteInput {
  dealerId: string;
  userId: string;
  content: string;
  entityType?: NoteEntityType | null;
  entityId?: string | null;
}

export interface UpdateNoteInput {
  content?: string;
}

export interface ListNotesFilter {
  entityType?: NoteEntityType;
  entityId?: string;
  userId?: string;
}

export const noteService = {
  /**
   * Create a note. entityType and entityId are optional — notes can
   * be standalone (general notepad). If provided, they must belong
   * to the same dealer.
   */
  async create(
    ctx: AuditContext,
    input: CreateNoteInput,
  ): Promise<{ id: string; userId: string; dealerId: string; content: string; createdAt: Date; updatedAt: Date }> {
    if (!input.content?.trim()) {
      throw new NotFoundError("Note content cannot be empty");
    }
    const db = withAuditContext(ctx, defaultPrisma);

    // Verify entity ownership if a polymorphic target is provided.
    if (input.entityType && input.entityId) {
      const owner = await resolveEntityOwner(db, input.entityType, input.entityId, input.dealerId);
      if (!owner) {
        throw new NotFoundError(`${input.entityType} not found`);
      }
    }

    const note = await db.note.create({
      data: {
        userId: input.userId,
        dealerId: input.dealerId,
        content: input.content.trim(),
      },
    });

    return {
      id: note.id,
      userId: note.userId,
      dealerId: note.dealerId,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  },

  /**
   * Update a note. Only the author (userId) can edit their own notes.
   */
  async update(
    ctx: AuditContext,
    dealerId: string,
    noteId: string,
    userId: string,
    input: UpdateNoteInput,
  ): Promise<{ id: string; content: string; updatedAt: Date }> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.note.findFirst({
      where: { id: noteId, dealerId },
    });
    if (!existing) throw new NotFoundError("Note not found");
    if (existing.userId !== userId) {
      throw new NotFoundError("You can only edit your own notes");
    }
    const updated = await db.note.update({
      where: { id: noteId },
      data: {
        ...(input.content !== undefined ? { content: input.content.trim() } : {}),
      },
    });
    return {
      id: updated.id,
      content: updated.content,
      updatedAt: updated.updatedAt,
    };
  },

  /**
   * Delete a note. Only the author or ADMIN/MANAGER can delete.
   */
  async delete(
    ctx: AuditContext,
    dealerId: string,
    noteId: string,
    userId: string,
    actorRole: string,
  ): Promise<void> {
    const db = withAuditContext(ctx, defaultPrisma);
    const existing = await db.note.findFirst({
      where: { id: noteId, dealerId },
    });
    if (!existing) throw new NotFoundError("Note not found");
    if (existing.userId !== userId && actorRole !== "ADMIN" && actorRole !== "MANAGER") {
      throw new NotFoundError("You can only delete your own notes");
    }
    await db.note.delete({ where: { id: noteId } });
  },

  /**
   * List notes for a polymorphic entity with cursor pagination.
   */
  async listForEntity(
    dealerId: string,
    filter: ListNotesFilter,
    pagination: { cursor?: string; limit: number },
  ): Promise<{ items: Array<{ id: string; userId: string; content: string; createdAt: string; updatedAt: string }>; pagination: { hasMore: boolean; cursor: string | null } }> {
    const { cursor, limit } = pagination;

    const items = await defaultPrisma.note.findMany({
      where: { dealerId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore && result.length > 0 ? result[result.length - 1]!.id : null;

    return {
      items: result.map((n) => ({
        id: n.id,
        userId: n.userId,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
      pagination: { hasMore, cursor: nextCursor },
    };
  },

  /**
   * List all notes for the dealer (global notepad). Cursor pagination.
   */
  async listAll(
    dealerId: string,
    pagination: { cursor?: string; limit: number },
  ): Promise<{ items: Array<{ id: string; userId: string; content: string; createdAt: string; updatedAt: string }>; pagination: { hasMore: boolean; cursor: string | null } }> {
    const { cursor, limit } = pagination;
    const items = await defaultPrisma.note.findMany({
      where: { dealerId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore && result.length > 0 ? result[result.length - 1]!.id : null;

    return {
      items: result.map((n) => ({
        id: n.id,
        userId: n.userId,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
      pagination: { hasMore, cursor: nextCursor },
    };
  },
};

/* ============================================================
 * Internal helpers
 * ============================================================ */

async function resolveEntityOwner(
  db: ReturnType<typeof withAuditContext>,
  entityType: NoteEntityType,
  entityId: string,
  dealerId: string,
): Promise<string | null> {
  switch (entityType) {
    case "lead": {
      const row = await db.lead.findFirst({ where: { id: entityId, dealerId }, select: { id: true } });
      return row?.id ?? null;
    }
    case "customer": {
      const row = await db.customer.findFirst({ where: { id: entityId, dealerId }, select: { id: true } });
      return row?.id ?? null;
    }
    case "vehicle": {
      const row = await db.vehicle.findFirst({ where: { id: entityId, dealerId }, select: { id: true } });
      return row?.id ?? null;
    }
    case "deal": {
      const row = await db.deal.findFirst({ where: { id: entityId, dealerId }, select: { id: true } });
      return row?.id ?? null;
    }
    default:
      return null;
  }
}
