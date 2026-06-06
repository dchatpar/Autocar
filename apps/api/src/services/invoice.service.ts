/**
 * Invoice Service — billing lifecycle.
 *
 * Wraps every mutation in `withAuditContext()` so the audit trail
 * records invoice issuance, payment, and refund events. Money
 * values are stored as cents (integers) to avoid float drift; the
 * adapter layer is responsible for currency formatting at the edge.
 */

import type { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../utils/prisma.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { withAuditContext, logActivity, type AuditContext } from "./activity-logger.service.js";

export interface CreateInvoiceInput {
  dealerId: string;
  customerId: string;
  dealId?: string | null;
  amountCents: number;
  currency?: string;
  description: string;
  dueAt: Date;
}

export interface RecordPaymentInput {
  amountCents: number;
  method: string;
  reference?: string | null;
  paidAt?: Date;
}

const CURRENCY_DEFAULT = "USD";

export const invoiceService = {
  /**
   * Issue a new invoice. The audit trail captures a `invoice.created`
   * event.
   */
  async create(
    ctx: AuditContext,
    input: CreateInvoiceInput,
  ): Promise<{ id: string; amountCents: number; status: string }> {
    if (input.amountCents <= 0) {
      throw new ValidationError("amountCents must be positive");
    }
    if (!input.description) {
      throw new ValidationError("description is required");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    // No explicit Invoice model in the current schema; we represent
    // invoices as a generic `Document` with a JSON metadata block and
    // audit-log it explicitly. This keeps the contract intact until
    // the dedicated Invoice table lands.
    const doc = await db.document.create({
      data: {
        dealerId: input.dealerId,
        type: "INVOICE",
        s3Key: `invoices/${input.dealerId}/${Date.now()}.json`,
        metadata: {
          amountCents: input.amountCents,
          currency: input.currency ?? CURRENCY_DEFAULT,
          description: input.description,
          dueAt: input.dueAt.toISOString(),
          status: "OPEN",
          customerId: input.customerId,
          dealId: input.dealId ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    await logActivity(ctx, {
      action: "invoice.created",
      entityType: "invoice",
      entityId: doc.id,
      after: {
        amountCents: input.amountCents,
        currency: input.currency ?? CURRENCY_DEFAULT,
        customerId: input.customerId,
        dealId: input.dealId ?? null,
      },
    });
    return {
      id: doc.id,
      amountCents: input.amountCents,
      status: "OPEN",
    };
  },

  /**
   * Send an invoice. Records `invoice.sent`.
   */
  async send(
    ctx: AuditContext,
    dealerId: string,
    invoiceId: string,
  ): Promise<void> {
    const db = withAuditContext(ctx, defaultPrisma);
    const doc = await db.document.findFirst({
      where: { id: invoiceId, dealerId, type: "INVOICE" },
    });
    if (!doc) throw new NotFoundError("Invoice not found");
    const meta = (doc.metadata ?? {}) as Record<string, unknown>;
    if (meta.status === "PAID") {
      throw new ValidationError("Cannot send a paid invoice");
    }
    await db.document.update({
      where: { id: invoiceId },
      data: {
        metadata: { ...meta, status: "SENT", sentAt: new Date().toISOString() },
      },
    });
    await logActivity(ctx, {
      action: "invoice.sent",
      entityType: "invoice",
      entityId: invoiceId,
      before: { status: meta.status },
      after: { status: "SENT", sentAt: new Date().toISOString() },
    });
  },

  /**
   * Record a payment against an invoice. Emits `invoice.paid` when
   * the cumulative payments cover the outstanding balance.
   */
  async recordPayment(
    ctx: AuditContext,
    dealerId: string,
    invoiceId: string,
    input: RecordPaymentInput,
  ): Promise<{ status: string; paidCents: number; remainingCents: number }> {
    if (input.amountCents <= 0) {
      throw new ValidationError("amountCents must be positive");
    }
    const db = withAuditContext(ctx, defaultPrisma);
    const doc = await db.document.findFirst({
      where: { id: invoiceId, dealerId, type: "INVOICE" },
    });
    if (!doc) throw new NotFoundError("Invoice not found");
    const meta = (doc.metadata ?? {}) as Record<string, unknown>;
    const amountCents = typeof meta.amountCents === "number" ? meta.amountCents : 0;
    const priorPaid =
      typeof meta.paidCents === "number" ? (meta.paidCents as number) : 0;
    const payments = Array.isArray(meta.payments)
      ? (meta.payments as Array<Record<string, unknown>>)
      : [];
    const newPaid = priorPaid + input.amountCents;
    const remaining = Math.max(amountCents - newPaid, 0);
    const newStatus = remaining === 0 ? "PAID" : "PARTIAL";
    const newPayments: Array<Record<string, unknown>> = [
      ...payments,
      {
        amountCents: input.amountCents,
        method: input.method,
        reference: input.reference ?? null,
        paidAt: (input.paidAt ?? new Date()).toISOString(),
        recordedBy: ctx.userId,
      },
    ];
    await db.document.update({
      where: { id: invoiceId },
      data: {
        metadata: {
          ...meta,
          paidCents: newPaid,
          remainingCents: remaining,
          payments: newPayments,
          status: newStatus,
        } as Prisma.InputJsonValue,
      },
    });
    await logActivity(ctx, {
      action: newStatus === "PAID" ? "invoice.paid" : "invoice.payment_recorded",
      entityType: "invoice",
      entityId: invoiceId,
      before: { paidCents: priorPaid, status: meta.status },
      after: { paidCents: newPaid, status: newStatus, amountCents: input.amountCents },
    });
    return { status: newStatus, paidCents: newPaid, remainingCents: remaining };
  },
};
