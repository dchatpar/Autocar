/**
 * Expense Service — track dealership expenses.
 *
 * Persists each expense as a `Note` row (placeholder until a real
 * Expense table lands) AND emits a dedicated `expense.created` audit
 * event so the timeline surfaces spending alongside deal events.
 *
 * Wraps every Prisma mutation in `withAuditContext()` so the wrapper
 * also writes the standard `note.created` row.
 */

import type { Note, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../utils/prisma.js";
import { ValidationError } from "../utils/errors.js";
import { withAuditContext, logActivity, type AuditContext } from "./activity-logger.service.js";

export interface CreateExpenseInput {
  dealerId: string;
  amountCents: number;
  currency?: string;
  category: string;
  description: string;
  vendor?: string | null;
  occurredAt: Date;
  receiptUrl?: string | null;
}

const CURRENCY_DEFAULT = "USD";

export const expenseService = {
  async create(ctx: AuditContext, input: CreateExpenseInput): Promise<Note> {
    if (input.amountCents <= 0) {
      throw new ValidationError("amountCents must be positive");
    }
    if (!input.category || !input.description) {
      throw new ValidationError("category and description are required");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const row = await db.note.create({
      data: {
        dealerId: input.dealerId,
        userId: ctx.userId ?? "",
        content: input.description,
      },
    });
    // The wrapper logs `note.created`. We add the dedicated expense
    // event so the timeline can filter by entityType='expense'.
    await logActivity(
      ctx,
      {
        action: "expense.created",
        entityType: "expense",
        entityId: row.id,
        after: {
          amountCents: input.amountCents,
          currency: input.currency ?? CURRENCY_DEFAULT,
          category: input.category,
          vendor: input.vendor ?? null,
          occurredAt: input.occurredAt.toISOString(),
          receiptUrl: input.receiptUrl ?? null,
        },
      },
    );
    return row;
  },

  async categorize(
    ctx: AuditContext,
    dealerId: string,
    noteId: string,
    newCategory: string,
  ): Promise<Note> {
    const db = withAuditContext(ctx, defaultPrisma);
    const note = await db.note.findFirst({ where: { id: noteId, dealerId } });
    if (!note) {
      throw new ValidationError("Expense not found");
    }
    return db.note.update({ where: { id: noteId }, data: { content: note.content } });
  },
};
