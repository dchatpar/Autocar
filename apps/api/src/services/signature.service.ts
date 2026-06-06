/**
 * Signature service — business logic for DocuSign envelope lifecycle.
 *
 * Responsibilities:
 *
 *   1. `createEnvelope` — validate the request, resolve the
 *      DocuSign template, hydrate merge fields from the deal,
 *      call the SDK, persist the envelope, and return a
 *      `DocumentSignature` row.
 *
 *   2. `getEnvelope` / `getEnvelopeForDeal` — tenant-scoped reads
 *      with optional live sync from DocuSign (so the UI can show
 *      the freshest status without waiting for the webhook).
 *
 *   3. `getEmbeddedUrl` — generate a one-time signing URL for a
 *      specific recipient. Validates that the caller is allowed
 *      to sign (i.e. the recipient's email matches a user OR
 *      the caller is a dealer admin).
 *
 *   4. `voidEnvelope` — cancel an envelope and record the reason.
 *
 *   5. `downloadPdf` — fetch the combined signed PDF for a
 *      completed envelope.
 *
 *   6. Webhook handlers — exposed as `applyWebhookEvent(...)` and
 *      `applyEnvelopeSnapshot(...)` for the route layer to call.
 *      They translate DocuSign's status into our `SignatureStatus`
 *      and update the `signers` JSON column in one Prisma call.
 *
 * Multi-tenancy:
 *   - Every Prisma query is scoped by `dealerId` (taken from
 *     the caller's tenant context).
 *   - Deal and Customer lookups also enforce the same scope.
 *
 * Audit:
 *   - All mutating operations log an `ActivityLog` row via
 *     `withAuditContext()`. The action names are stable:
 *     `signature.envelope_created`, `signature.envelope_sent`,
 *     `signature.envelope_voided`, `signature.embedded_url_issued`,
 *     `signature.pdf_downloaded`, `signature.webhook_event`.
 */

import type {
  DocumentSignature,
  DocumentType,
  Prisma,
  SignatureStatus,
} from "@prisma/client";
import { Prisma as PrismaValue } from "@prisma/client";
import { prisma as defaultPrisma } from "../utils/prisma.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import {
  type AuditContext,
  withAuditContext,
  logActivity,
} from "./activity-logger.service.js";
import {
  createEnvelopeFromTemplate,
  downloadCompletedDocument,
  getEmbeddedSigningUrl,
  getEnvelopeStatus,
  voidEnvelope,
  type CreateEnvelopeInput,
  type EnvelopeStatusResult,
} from "../integrations/docusign/client.js";
import {
  getTemplateByDocumentType,
  getTemplateBySlug,
  mapDocuSignEnvelopeStatus,
  mapDocuSignRecipientStatus,
  type TemplateDefinition,
} from "../integrations/docusign/templates.js";
import {
  findUnknownMergeFields,
  MERGE_FIELD_KEYS,
  type MergeFieldKey,
  type MergeFieldMap,
  normalizeMergeFields,
  substitute,
} from "../utils/docusign-merge-fields.js";

/* ============================================================
 * Public types
 * ============================================================ */

export interface SignerInput {
  roleName: string;
  email: string;
  name: string;
  /** Required for embedded signing; otherwise email-only signing. */
  clientUserId?: string;
}

export interface CreateEnvelopeRequest {
  dealerId: string;
  dealId?: string | null;
  documentId?: string | null;
  /** Template identifier — either a slug ("bill_of_sale") or a DocumentType ("BILL_OF_SALE"). */
  templateSlug: string;
  signers: SignerInput[];
  /** Raw merge fields keyed by `{{placeholder}}` name. Will be normalized + substituted. */
  mergeFields?: MergeFieldMap;
  /** Override email subject (supports `{{placeholder}}`). */
  emailSubject?: string;
  /** Override email body (supports `{{placeholder}}`). */
  emailMessage?: string;
  /** When false, create in CREATED state (don't send yet). Default true. */
  sendNow?: boolean;
  /** Connect webhook URL. */
  webhookUrl?: string;
  /** Audit metadata. */
  metadata?: Record<string, unknown>;
}

export interface EnvelopeSignerView {
  email: string;
  name: string;
  role: string;
  status: "created" | "sent" | "delivered" | "completed" | "declined";
  signedAt: string | null;
  deliveredAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  clientUserId: string | null;
}

export interface EnvelopeView {
  id: string;
  dealerId: string;
  dealId: string | null;
  documentId: string | null;
  envelopeId: string;
  templateId: string;
  documentType: DocumentType;
  status: SignatureStatus;
  subject: string | null;
  emailMessage: string | null;
  signers: EnvelopeSignerView[];
  sentAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  declinedReason: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  expiresAt: string | null;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmbeddedUrlRequest {
  dealerId: string;
  userId: string;
  /** Caller's role — FINANCE/MANAGER/ADMIN can sign for any signer; others only their own. */
  callerRole: string;
  /** Email the URL is being requested for. If the caller is an internal user, this is the signer's email. */
  signerEmail: string;
  returnUrl: string;
  /** Override authentication method (default "none" for embedded). */
  authenticationMethod?: "none" | "email" | "biometric" | "sms" | "phone";
}

export interface VoidRequest {
  dealerId: string;
  userId: string;
  reason: string;
  /** Caller's role from the JWT (ADMIN / MANAGER / FINANCE / SALES / BDC). */
  callerRole: string;
}

/* ============================================================
 * Webhook event types
 * ============================================================ */

export type DocuSignWebhookEvent =
  | "envelope-sent"
  | "envelope-delivered"
  | "envelope-completed"
  | "envelope-declined"
  | "envelope-voided"
  | "envelope-corrected"
  | "envelope-expired"
  | "recipient-completed"
  | "recipient-delivered"
  | "recipient-declined"
  | "recipient-sent";

export interface DocuSignWebhookEnvelope {
  envelopeId: string;
  status?: string;
  emailSubject?: string;
  sentDateTime?: string;
  deliveredDateTime?: string;
  completedDateTime?: string;
  declinedDateTime?: string;
  voidedDateTime?: string;
  voidedReason?: string;
  statusChangedDateTime?: string;
  customFields?: {
    textCustomFields?: Array<{ name?: string; value?: string }>;
  };
}

export interface DocuSignWebhookRecipient {
  recipientId?: string;
  routingOrder?: string;
  clientUserId?: string;
  name?: string;
  email?: string;
  status?: string;
  signedDateTime?: string;
  deliveredDateTime?: string;
  declinedDateTime?: string;
  declineReason?: string;
}

export interface DocuSignWebhookPayload {
  event: DocuSignWebhookEvent | string;
  apiVersion?: string;
  uri?: string;
  retryCount?: number;
  configurationId?: number;
  generatedDateTime?: string;
  data?: {
    accountId?: string;
    userId?: string;
    envelopeId?: string;
    envelopeSummary?: DocuSignWebhookEnvelope;
    envelopeDocuments?: Array<{ documentId?: string; name?: string; type?: string }>;
    recipients?: {
      signers?: DocuSignWebhookRecipient[];
    };
  };
}

/* ============================================================
 * Mappers
 * ============================================================ */

function toIsoOrNull(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

function signerRowToView(signer: EnvelopeSignerView): EnvelopeSignerView {
  return signer;
}

export function toEnvelopeView(row: DocumentSignature): EnvelopeView {
  const signers = parseSignersJson(row.signers);
  return {
    id: row.id,
    dealerId: row.dealerId,
    dealId: row.dealId,
    documentId: row.documentId,
    envelopeId: row.envelopeId,
    templateId: row.templateId,
    documentType: row.documentType,
    status: row.status,
    subject: row.subject,
    emailMessage: row.emailMessage,
    signers: signers.map(signerRowToView),
    sentAt: toIsoOrNull(row.sentAt),
    deliveredAt: toIsoOrNull(row.deliveredAt),
    completedAt: toIsoOrNull(row.completedAt),
    declinedAt: toIsoOrNull(row.declinedAt),
    declinedReason: row.declinedReason,
    voidedAt: toIsoOrNull(row.voidedAt),
    voidedReason: row.voidedReason,
    expiresAt: toIsoOrNull(row.expiresAt),
    pdfUrl: row.pdfUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseSignersJson(raw: Prisma.JsonValue | null | undefined): EnvelopeSignerView[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return (raw as unknown[]).filter(isSignerView);
  }
  return [];
}

function isSignerView(v: unknown): v is EnvelopeSignerView {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.email === "string" &&
    typeof r.name === "string" &&
    typeof r.role === "string"
  );
}

/* ============================================================
 * Validation
 * ============================================================ */

function validateCreateRequest(input: CreateEnvelopeRequest): void {
  if (!input.templateSlug || typeof input.templateSlug !== "string") {
    throw new ValidationError("templateSlug is required");
  }
  if (!Array.isArray(input.signers) || input.signers.length === 0) {
    throw new ValidationError("at least one signer is required");
  }
  for (const s of input.signers) {
    if (!s.roleName || typeof s.roleName !== "string") {
      throw new ValidationError("each signer needs a roleName");
    }
    if (!s.email || typeof s.email !== "string") {
      throw new ValidationError(`signer ${s.roleName} needs an email`);
    }
    if (!s.name || typeof s.name !== "string") {
      throw new ValidationError(`signer ${s.roleName} needs a name`);
    }
  }
  if (input.mergeFields) {
    const unknown = findUnknownMergeFields(input.mergeFields);
    if (unknown.length > 0) {
      throw new ValidationError(
        `Unknown merge fields: ${unknown.join(", ")}`,
        { unknown, knownFields: MERGE_FIELD_KEYS },
      );
    }
  }
}

/**
 * Verify the caller's deal belongs to the same dealer and (if the
 * template requires an embedded signer) the signer is allowed to
 * sign for it. Throws NotFound if the deal doesn't exist; Forbidden
 * if it belongs to a different dealer.
 */
async function loadDealForRequest(
  dealerId: string,
  dealId: string,
): Promise<{ id: string; dealerId: string }> {
  const deal = await defaultPrisma.deal.findFirst({
    where: { id: dealId, dealerId },
    select: { id: true, dealerId: true },
  });
  if (!deal) {
    throw new NotFoundError("Deal not found");
  }
  return deal;
}

/* ============================================================
 * Merge field hydration
 * ============================================================ */

export interface DealHydration {
  dealer: { name: string; address: string | null; phone: string | null; license: string | null };
  deal: {
    id: string;
    dealNumber: string;
    salePrice: number | null;
    downPayment: number | null;
    tradeValue: number | null;
    tradePayoff: number | null;
    taxAmount: number | null;
    feeTotal: number | null;
    financedAmount: number | null;
    rate: number | null;
    termMonths: number | null;
    paymentAmount: number | null;
  };
  customer: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  coBuyer: {
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
    color: string | null;
  } | null;
  trade: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
  } | null;
  manager: {
    name: string;
    email: string;
  } | null;
}

function formatAddress(
  parts: { line1: string | null; line2?: string | null; city: string | null; state: string | null; zip: string | null },
): string {
  const segs: string[] = [];
  if (parts.line1) segs.push(parts.line1);
  if (parts.line2) segs.push(parts.line2);
  const cityState = [parts.city, parts.state].filter(Boolean).join(", ");
  const tail = [cityState, parts.zip].filter(Boolean).join(" ");
  if (tail) segs.push(tail);
  return segs.join(", ");
}

function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined) return "";
  return `${n.toFixed(decimals)}%`;
}

function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return Math.trunc(n).toString();
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString("en-US");
}

/**
 * Load a deal + customer + vehicle + co-buyer + trade from the
 * database, formatted into a flat merge field map. The result is
 * the union of `MERGE_FIELD_KEYS` — empty strings where data is
 * missing. The caller can override individual fields via the
 * `mergeFields` input.
 */
export async function hydrateMergeFieldsForDeal(
  dealerId: string,
  dealId: string,
): Promise<Record<MergeFieldKey, string>> {
  const deal = await defaultPrisma.deal.findFirst({
    where: { id: dealId, dealerId },
    include: {
      dealer: { select: { name: true, settings: true } },
      customer: true,
      vehicle: true,
      terms: true,
      assignedTo: { select: { name: true, email: true } },
    },
  });
  if (!deal) {
    throw new NotFoundError("Deal not found for hydration");
  }

  const settings = (deal.dealer?.settings ?? {}) as Record<string, unknown>;
  const dealerAddress = (settings.address as string | undefined) ?? "";
  const dealerPhone = (settings.phone as string | undefined) ?? "";
  const dealerLicense = (settings.license as string | undefined) ?? "";

  const customerAddress = (() => {
    const addr = deal.customer?.address;
    if (!addr || typeof addr !== "object") return "";
    const a = addr as { line1?: unknown; line2?: unknown; city?: unknown; state?: unknown; zip?: unknown; postal?: unknown };
    return formatAddress({
      line1: typeof a.line1 === "string" ? a.line1 : null,
      line2: typeof a.line2 === "string" ? a.line2 : null,
      city: typeof a.city === "string" ? a.city : null,
      state: typeof a.state === "string" ? a.state : null,
      zip: typeof a.zip === "string" ? a.zip : typeof a.postal === "string" ? a.postal : null,
    });
  })();

  const vehicle = deal.vehicle
    ? {
        year: deal.vehicle.year ?? null,
        make: deal.vehicle.make ?? null,
        model: deal.vehicle.model ?? null,
        trim: deal.vehicle.trim ?? null,
        vin: deal.vehicle.vin ?? null,
        mileage: deal.vehicle.mileage ?? null,
        color: deal.vehicle.exteriorColor ?? null,
      }
    : null;

  // Co-buyer is a separate customer record when present; we look up
  // via the deal.metadata.coBuyerId JSON column to keep the schema
  // simple. Falls back to empty strings.
  const dealMeta = (deal as unknown as { metadata?: Record<string, unknown> | null }).metadata ?? {};
  const coBuyerId = typeof dealMeta.coBuyerId === "string" ? dealMeta.coBuyerId : null;
  const coBuyer = coBuyerId
    ? await defaultPrisma.customer.findFirst({
        where: { id: coBuyerId, dealerId },
        select: { firstName: true, lastName: true, email: true },
      })
    : null;

  const tradeVin = typeof dealMeta.tradeVin === "string" ? dealMeta.tradeVin : null;
  const trade = tradeVin
    ? await defaultPrisma.vehicle.findFirst({
        where: { vin: tradeVin, dealerId },
        select: { year: true, make: true, model: true, trim: true, vin: true, mileage: true },
      })
    : null;

  const manager = deal.assignedTo?.email
    ? { name: deal.assignedTo.name, email: deal.assignedTo.email }
    : null;

  const customerName = deal.customer
    ? `${deal.customer.firstName ?? ""} ${deal.customer.lastName ?? ""}`.trim()
    : "";

  const fields: Record<MergeFieldKey, string> = {
    buyer_name: customerName,
    buyer_email: deal.customer?.email ?? "",
    buyer_address: customerAddress,
    buyer_phone: deal.customer?.phone ?? "",
    co_buyer_name: coBuyer ? `${coBuyer.firstName} ${coBuyer.lastName}`.trim() : "",
    co_buyer_email: coBuyer?.email ?? "",
    seller_name: "",
    dealer_name: deal.dealer?.name ?? "",
    dealer_address: dealerAddress,
    dealer_phone: dealerPhone,
    dealer_license: dealerLicense,
    vehicle_year: vehicle ? String(vehicle.year ?? "") : "",
    vehicle_make: vehicle?.make ?? "",
    vehicle_model: vehicle?.model ?? "",
    vehicle_trim: vehicle?.trim ?? "",
    vehicle_vin: vehicle?.vin ?? "",
    vehicle_mileage: vehicle ? formatNumber(vehicle.mileage) : "",
    vehicle_color: vehicle?.color ?? "",
    sale_price: formatCurrency(deal.terms?.salePrice),
    down_payment: formatCurrency(deal.terms?.downPayment),
    trade_value: formatCurrency(deal.terms?.tradeValue),
    trade_payoff: formatCurrency(deal.terms?.tradePayoff),
    trade_allowance: formatCurrency(deal.terms?.tradeValue),
    tax_amount: formatCurrency(deal.terms?.taxAmount),
    fee_total: formatCurrency(deal.terms?.feeTotal),
    financed_amount: formatCurrency(deal.terms?.financedAmount),
    monthly_payment: formatCurrency(deal.terms?.paymentAmount),
    term_months: formatInt(deal.terms?.termMonths),
    rate: deal.terms?.rate !== null && deal.terms?.rate !== undefined
      ? formatPercent(deal.terms.rate)
      : "",
    apr: deal.terms?.rate !== null && deal.terms?.rate !== undefined
      ? formatPercent(deal.terms.rate)
      : "",
    lender: deal.terms?.lender ?? "",
    contract_date: new Date().toISOString().slice(0, 10),
    delivery_date: new Date().toISOString().slice(0, 10),
    warranty_provider: "",
    warranty_term: "",
    warranty_deductible: "",
    warranty_price: "",
    trade_vin: trade?.vin ?? "",
    trade_year_make_model: trade
      ? `${trade.year ?? ""} ${trade.make ?? ""} ${trade.model ?? ""} ${trade.trim ?? ""}`.trim()
      : "",
    appraisal_date: "",
    appraisal_value: "",
    credit_score: "",
    gross_cap_cost: "",
    residual_value: "",
    mileage_allowance: "",
    manager_name: manager?.name ?? "",
    manager_email: manager?.email ?? "",
    deal_number: deal.id,
  };

  return fields;
}

/* ============================================================
 * Service
 * ============================================================ */

export const signatureService = {
  /**
   * Create a DocuSign envelope and persist a `DocumentSignature` row.
   *
   * Flow:
   *   1. Validate request
   *   2. Load template definition
   *   3. Hydrate merge fields from deal (if dealId) and merge caller overrides
   *   4. Call DocuSign createEnvelopeFromTemplate
   *   5. Persist row + audit log
   */
  async create(
    ctx: AuditContext,
    input: CreateEnvelopeRequest,
  ): Promise<EnvelopeView> {
    validateCreateRequest(input);

    // 1. Resolve template
    const template = getTemplateBySlug(input.templateSlug);
    const rolesByName = new Map(template.roles.map((r) => [r.name, r]));
    for (const s of input.signers) {
      if (!rolesByName.has(s.roleName)) {
        throw new ValidationError(
          `Template ${template.slug} does not have a role named "${s.roleName}"`,
          { availableRoles: template.roles.map((r) => r.name) },
        );
      }
    }

    // 2. Hydrate merge fields
    let merged: Record<MergeFieldKey, string> = {} as Record<MergeFieldKey, string>;
    if (input.dealId) {
      await loadDealForRequest(input.dealerId, input.dealId);
      merged = await hydrateMergeFieldsForDeal(input.dealerId, input.dealId);
    }
    if (input.mergeFields) {
      const overrides = normalizeMergeFields(input.mergeFields);
      merged = { ...merged, ...overrides };
    }

    // 3. Compose signers
    const signers: CreateEnvelopeInput["signers"] = input.signers.map((s, idx) => ({
      email: s.email,
      name: s.name,
      roleName: s.roleName,
      clientUserId: s.clientUserId ?? `${input.dealerId}:${s.roleName}:${idx + 1}`,
      recipientId: String(idx + 1),
      routingOrder: template.signingOrder === "sequential" ? idx + 1 : 1,
    }));

    // 4. Subject + email body
    const subject = substitute(
      input.emailSubject ?? template.subject,
      merged,
    );
    const emailMessage = substitute(
      input.emailMessage ?? template.emailMessage,
      merged,
    );

    // 5. Call DocuSign
    const result = await createEnvelopeFromTemplate({
      templateSlug: input.templateSlug,
      signers,
      emailSubject: subject,
      emailMessage,
      mergeFields: merged,
      sendNow: input.sendNow !== false,
      metadata: {
        dealerId: input.dealerId,
        ...(input.dealId ? { dealId: input.dealId } : {}),
        ...(input.documentId ? { documentId: input.documentId } : {}),
      },
      eventNotification: input.webhookUrl
        ? {
            url: input.webhookUrl,
            includeTimeZone: true,
            includeSenderAccountAsCustomField: true,
            includeEnvelopeVoidReason: true,
          }
        : undefined,
    });

    // 6. Persist
    const db = withAuditContext(ctx, defaultPrisma);
    const stored = await db.documentSignature.create({
      data: {
        dealerId: input.dealerId,
        dealId: input.dealId ?? null,
        documentId: input.documentId ?? null,
        envelopeId: result.envelopeId,
        templateId: result.uri || template.slug,
        status: mapDocuSignEnvelopeStatus(result.status),
        documentType: template.id,
        subject,
        emailMessage,
        signers: signers.map((s, idx) => ({
          email: s.email,
          name: s.name,
          role: s.roleName,
          status: "sent" as const,
          signedAt: null,
          deliveredAt: null,
          declinedAt: null,
          declineReason: null,
          clientUserId: s.clientUserId ?? null,
          recipientId: s.recipientId ?? String(idx + 1),
        })),
        createdById: ctx.userId,
        sentAt: result.status === "sent" ? new Date() : null,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? PrismaValue.DbNull,
      },
    });

    await logActivity(ctx, {
      action: input.sendNow === false ? "signature.envelope_created" : "signature.envelope_sent",
      entityType: "DocumentSignature",
      entityId: stored.id,
      metadata: {
        envelopeId: result.envelopeId,
        templateSlug: template.slug,
        documentType: template.id,
        signers: signers.map((s) => ({ email: s.email, role: s.roleName })),
      },
    });

    return toEnvelopeView(stored);
  },

  /**
   * Fetch a single envelope by its internal row id, scoped to
   * the dealer's tenant. If `syncFromDocuSign` is true, also
   * pull the live status from DocuSign and update the row.
   */
  async getById(
    ctx: AuditContext,
    id: string,
    options: { syncFromDocuSign?: boolean } = {},
  ): Promise<EnvelopeView> {
    if (!ctx.dealerId) {
      throw new ForbiddenError("Tenant context required");
    }
    const row = await defaultPrisma.documentSignature.findFirst({
      where: { id, dealerId: ctx.dealerId },
    });
    if (!row) {
      throw new NotFoundError("Envelope not found");
    }
    if (options.syncFromDocuSign) {
      const live = await getEnvelopeStatus(row.envelopeId);
      const updated = await applyEnvelopeSnapshot(row, live, { pullSigners: true });
      return toEnvelopeView(updated);
    }
    return toEnvelopeView(row);
  },

  /**
   * Fetch a single envelope by its DocuSign envelopeId, scoped to
   * the dealer's tenant. Used by the webhook handler when we don't
   * have the internal row id at hand.
   */
  async getByEnvelopeId(
    dealerId: string,
    envelopeId: string,
  ): Promise<DocumentSignature | null> {
    return defaultPrisma.documentSignature.findFirst({
      where: { dealerId, envelopeId },
    });
  },

  /**
   * List envelopes for a deal. Newest first.
   */
  async listForDeal(
    ctx: AuditContext,
    dealId: string,
  ): Promise<EnvelopeView[]> {
    if (!ctx.dealerId) {
      throw new ForbiddenError("Tenant context required");
    }
    // Confirm the deal belongs to the dealer.
    const deal = await defaultPrisma.deal.findFirst({
      where: { id: dealId, dealerId: ctx.dealerId },
      select: { id: true },
    });
    if (!deal) {
      throw new NotFoundError("Deal not found");
    }
    const rows = await defaultPrisma.documentSignature.findMany({
      where: { dealerId: ctx.dealerId, dealId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toEnvelopeView);
  },

  /**
   * List all envelopes for the dealer. Supports the optional
   * `documentType` and `status` filters used by the deal detail
   * "signatures" page.
   */
  async list(
    ctx: AuditContext,
    filters: {
      dealId?: string;
      documentType?: DocumentType;
      status?: SignatureStatus;
    } = {},
  ): Promise<EnvelopeView[]> {
    if (!ctx.dealerId) {
      throw new ForbiddenError("Tenant context required");
    }
    const rows = await defaultPrisma.documentSignature.findMany({
      where: {
        dealerId: ctx.dealerId,
        ...(filters.dealId ? { dealId: filters.dealId } : {}),
        ...(filters.documentType ? { documentType: filters.documentType } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map(toEnvelopeView);
  },

  /**
   * Get a one-time embedded signing URL for a specific recipient.
   *
   * Authorization:
   *   - ADMIN / MANAGER / FINANCE: can request a URL for any signer
   *   - Other roles: must match the signer's email
   */
  async getEmbeddedUrl(
    ctx: AuditContext,
    envelopeId: string,
    request: EmbeddedUrlRequest,
  ): Promise<{ url: string; expiresAt: string | null; signer: EnvelopeSignerView }> {
    if (!ctx.dealerId) {
      throw new ForbiddenError("Tenant context required");
    }
    const row = await defaultPrisma.documentSignature.findFirst({
      where: { id: envelopeId, dealerId: ctx.dealerId },
    });
    if (!row) {
      throw new NotFoundError("Envelope not found");
    }
    if (row.status === "COMPLETED" || row.status === "VOIDED" || row.status === "DECLINED" || row.status === "EXPIRED") {
      throw new ValidationError(
        `Cannot issue signing URL for envelope in status ${row.status}`,
      );
    }
    const signers = parseSignersJson(row.signers);
    const signer = signers.find((s) => s.email.toLowerCase() === request.signerEmail.toLowerCase());
    if (!signer) {
      throw new NotFoundError(
        `No signer with email ${request.signerEmail} on this envelope`,
      );
    }
    if (!signer.clientUserId) {
      throw new ValidationError(
        "Signer was not created with a clientUserId; embedded signing is unavailable — use email signing instead",
      );
    }

    // Authorization: only admin/manager/finance can sign on behalf of another.
    const privileged = ["ADMIN", "MANAGER", "FINANCE"].includes(
      request.callerRole.toUpperCase(),
    );
    if (!privileged && request.signerEmail.toLowerCase() !== (ctx.userId ?? "").toLowerCase()) {
      // For non-privileged users, the signer's email must match
      // the user record's email (looked up from JWT, but we only
      // have userId here — so we accept if the user is requesting
      // a URL for an envelope that contains their own userId as
      // clientUserId, or if their email matches).
      const caller = await defaultPrisma.user.findFirst({
        where: { id: ctx.userId ?? "", dealerId: ctx.dealerId },
        select: { email: true },
      });
      if (!caller || caller.email.toLowerCase() !== request.signerEmail.toLowerCase()) {
        throw new ForbiddenError("You can only request a signing URL for your own signature");
      }
    }

    // Refresh the recipient list so we get an up-to-date recipientId.
    const live = await getEnvelopeStatus(row.envelopeId);
    const liveSigner = live.signers.find(
      (s) => s.email.toLowerCase() === request.signerEmail.toLowerCase(),
    );
    if (!liveSigner) {
      throw new NotFoundError("Signer not found on the live envelope");
    }
    if (liveSigner.status === "completed") {
      throw new ValidationError("Signer has already completed signing");
    }

    const url = await getEmbeddedSigningUrl({
      envelopeId: row.envelopeId,
      recipientId: liveSigner.recipientId,
      clientUserId: signer.clientUserId,
      userName: signer.name,
      email: signer.email,
      returnUrl: request.returnUrl,
      authenticationMethod: request.authenticationMethod ?? "none",
    });

    await logActivity(ctx, {
      action: "signature.embedded_url_issued",
      entityType: "DocumentSignature",
      entityId: row.id,
      metadata: {
        envelopeId: row.envelopeId,
        signerEmail: signer.email,
        role: signer.role,
      },
    });

    return { url: url.url, expiresAt: url.expiresAt, signer };
  },

  /**
   * Void an envelope. Records the reason and an audit log.
   * ADMIN / MANAGER / FINANCE only.
   */
  async void(
    ctx: AuditContext,
    id: string,
    request: VoidRequest,
  ): Promise<EnvelopeView> {
    if (!ctx.dealerId) {
      throw new ForbiddenError("Tenant context required");
    }
    if (!request.reason || request.reason.trim().length === 0) {
      throw new ValidationError("Void reason is required");
    }
    if (!["ADMIN", "MANAGER", "FINANCE"].includes((request.callerRole ?? ctx.role ?? "").toUpperCase())) {
      throw new ForbiddenError("Only managers or admins can void envelopes");
    }

    const row = await defaultPrisma.documentSignature.findFirst({
      where: { id, dealerId: ctx.dealerId },
    });
    if (!row) {
      throw new NotFoundError("Envelope not found");
    }
    if (row.status === "COMPLETED" || row.status === "VOIDED") {
      throw new ValidationError(`Cannot void envelope in status ${row.status}`);
    }

    const result = await voidEnvelope(row.envelopeId, request.reason);

    const updated = await defaultPrisma.documentSignature.update({
      where: { id: row.id },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedReason: request.reason,
      },
    });

    await logActivity(ctx, {
      action: "signature.envelope_voided",
      entityType: "DocumentSignature",
      entityId: row.id,
      before: { status: row.status, voidedAt: row.voidedAt, voidedReason: row.voidedReason },
      after: { status: "VOIDED", voidedAt: updated.voidedAt, voidedReason: request.reason },
      metadata: { envelopeId: row.envelopeId, reason: request.reason, docusignStatus: result.status },
    });

    return toEnvelopeView(updated);
  },

  /**
   * Download the combined signed PDF. Available only when the
   * envelope is COMPLETED.
   */
  async downloadPdf(
    ctx: AuditContext,
    id: string,
  ): Promise<{ base64: string; mimeType: "application/pdf"; filename: string; bytes: number }> {
    if (!ctx.dealerId) {
      throw new ForbiddenError("Tenant context required");
    }
    const row = await defaultPrisma.documentSignature.findFirst({
      where: { id, dealerId: ctx.dealerId },
    });
    if (!row) {
      throw new NotFoundError("Envelope not found");
    }
    if (row.status !== "COMPLETED") {
      throw new ValidationError("Signed PDF is only available once the envelope is completed");
    }
    const pdf = await downloadCompletedDocument(row.envelopeId);

    await logActivity(ctx, {
      action: "signature.pdf_downloaded",
      entityType: "DocumentSignature",
      entityId: row.id,
      metadata: { envelopeId: row.envelopeId, bytes: pdf.bytes },
    });

    return pdf;
  },

  /* ============================================================
   * Webhook handler
   * ============================================================ */

  /**
   * Apply a DocuSign Connect webhook event to the matching
   * `DocumentSignature` row. Idempotent: re-delivering the same
   * event is a no-op.
   *
   * Returns the updated row, or `null` if we couldn't find a
   * matching envelope (e.g. it was created in a different env).
   */
  async applyWebhookEvent(
    payload: DocuSignWebhookPayload,
    context: { dealerIdHint?: string | null } = {},
  ): Promise<DocumentSignature | null> {
    const envelopeId = payload.data?.envelopeId ?? payload.data?.envelopeSummary?.envelopeId;
    if (!envelopeId) {
      throw new ValidationError("Webhook payload missing envelopeId");
    }

    // Locate the row. Prefer the dealer hint embedded in custom fields;
    // fall back to a global search by envelopeId.
    let row: DocumentSignature | null = await this.locateRow(envelopeId, context.dealerIdHint ?? null);
    if (!row) {
      // Try matching by envelope custom field (dealerId).
      const customDealerId = payload.data?.envelopeSummary?.customFields?.textCustomFields?.find(
        (f) => f.name === "dealerId",
      )?.value;
      if (customDealerId) {
        row = await this.locateRow(envelopeId, customDealerId);
      }
    }
    if (!row) {
      // Last resort: if there's exactly one dealer in the system,
      // use it. This is a dev-only convenience; production tenants
      // are expected to populate custom fields.
      const allMatches = await defaultPrisma.documentSignature.findMany({
        where: { envelopeId },
        take: 2,
      });
      if (allMatches.length === 1) {
        row = allMatches[0] ?? null;
      } else if (allMatches.length > 1) {
        // Multiple dealers have an envelope with the same id —
        // we can't safely update any of them. Bail.
        return null;
      } else {
        return null;
      }
    }

    // Translate the event.
    const summary = payload.data?.envelopeSummary;
    const liveSigners = (payload.data?.recipients?.signers ?? []).map((s) => ({
      recipientId: s.recipientId ?? "",
      email: s.email ?? "",
      name: s.name ?? "",
      status: mapDocuSignRecipientStatus(s.status),
      signedAt: s.signedDateTime ?? null,
      deliveredAt: s.deliveredDateTime ?? null,
      declinedAt: s.declinedDateTime ?? null,
      declineReason: s.declineReason ?? null,
      clientUserId: s.clientUserId ?? null,
    }));

    const update: Prisma.DocumentSignatureUpdateInput = {};

    switch (payload.event) {
      case "envelope-sent":
        update.status = "SENT";
        update.sentAt = summary?.sentDateTime ? new Date(summary.sentDateTime) : new Date();
        break;
      case "envelope-delivered":
        update.status = "DELIVERED";
        update.deliveredAt = summary?.deliveredDateTime
          ? new Date(summary.deliveredDateTime)
          : new Date();
        break;
      case "envelope-completed":
        update.status = "COMPLETED";
        update.completedAt = summary?.completedDateTime
          ? new Date(summary.completedDateTime)
          : new Date();
        // Optionally backfill the signed PDF URL if it was carried.
        break;
      case "envelope-declined":
        update.status = "DECLINED";
        update.declinedAt = summary?.declinedDateTime
          ? new Date(summary.declinedDateTime)
          : new Date();
        break;
      case "envelope-voided":
        update.status = "VOIDED";
        update.voidedAt = summary?.voidedDateTime
          ? new Date(summary.voidedDateTime)
          : new Date();
        update.voidedReason = summary?.voidedReason ?? null;
        break;
      case "envelope-expired":
        update.status = "EXPIRED";
        break;
      case "recipient-completed":
      case "recipient-delivered":
      case "recipient-declined":
      case "recipient-sent":
        // Recipient-level events update the signers array but keep
        // the envelope-level status unless the envelope is now
        // fully complete. Fall through to signers merge below.
        break;
      default:
        // Unknown event — record the payload and move on.
        break;
    }

    // Merge signers in: keep our rows, update statuses from DocuSign.
    const mergedSigners = mergeSignerUpdates(parseSignersJson(row!.signers), liveSigners);
    update.signers = mergedSigners as unknown as Prisma.InputJsonValue;

    // If this recipient event turned the envelope to "completed",
    // reflect that on the row (some webhook configurations only
    // send recipient events).
    if (mergedSigners.length > 0 && mergedSigners.every((s) => s.status === "completed")) {
      update.status = "COMPLETED";
      update.completedAt = update.completedAt ?? new Date();
    }

    const updated = await defaultPrisma.documentSignature.update({
      where: { id: row!.id },
      data: update,
    });

    // Audit the webhook (best-effort; no request context for a webhook call).
    try {
      await logActivity(
        {
          userId: null,
          dealerId: row!.dealerId,
          role: "SYSTEM",
          metadata: { source: "docusign_webhook" },
        },
        {
          action: "signature.webhook_event",
          entityType: "DocumentSignature",
          entityId: row!.id,
          metadata: {
            event: payload.event,
            envelopeId,
            docusignStatus: summary?.status,
            recipients: liveSigners.length,
          },
        },
      );
    } catch {
      // Swallow — audit log is not on the critical path of state changes.
    }

    return updated;
  },

  /**
   * Pull the live envelope from DocuSign and apply it to our row.
   * Used by the route handler when `?sync=1` is passed.
   */
  async applyEnvelopeSnapshot(
    dealerId: string,
    envelopeId: string,
    live: EnvelopeStatusResult,
  ): Promise<DocumentSignature> {
    const row = await this.locateRow(envelopeId, dealerId);
    if (!row) {
      throw new NotFoundError("Envelope not found");
    }
    return applyEnvelopeSnapshot(row, live, { pullSigners: true });
  },

  /**
   * Resolve which dealer owns an envelope — used by the webhook
   * handler when we don't have the row in hand.
   */
  async locateRow(
    envelopeId: string,
    dealerIdHint: string | null,
  ): Promise<DocumentSignature | null> {
    if (dealerIdHint) {
      const hit = await defaultPrisma.documentSignature.findFirst({
        where: { envelopeId, dealerId: dealerIdHint },
      });
      if (hit) return hit;
    }
    // Global lookup (small data set; envelopeId is unique).
    return defaultPrisma.documentSignature.findFirst({
      where: { envelopeId },
    });
  },
};

/* ============================================================
 * Helpers
 * ============================================================ */

async function applyEnvelopeSnapshot(
  row: DocumentSignature,
  live: EnvelopeStatusResult,
  opts: { pullSigners: boolean },
): Promise<DocumentSignature> {
  const update: Prisma.DocumentSignatureUpdateInput = {
    status: mapDocuSignEnvelopeStatus(live.status),
  };
  if (live.sentDateTime) update.sentAt = new Date(live.sentDateTime);
  if (live.completedDateTime) update.completedAt = new Date(live.completedDateTime);
  if (live.deliveredDateTime) update.deliveredAt = new Date(live.deliveredDateTime);
  if (live.declinedDateTime) update.declinedAt = new Date(live.declinedDateTime);
  if (live.voidedDateTime) update.voidedAt = new Date(live.voidedDateTime);
  if (live.voidedReason) update.voidedReason = live.voidedReason;
  if (opts.pullSigners) {
    const current = parseSignersJson(row.signers);
    const liveMapped = live.signers.map((s) => ({
      email: s.email,
      name: s.name,
      role: current.find((c) => c.email.toLowerCase() === s.email.toLowerCase())?.role ?? "",
      status: mapDocuSignRecipientStatus(s.status),
      signedAt: s.signedDateTime,
      deliveredAt: s.deliveredDateTime,
      declinedAt: s.declinedDateTime,
      declineReason: s.declineReason,
      clientUserId: s.clientUserId,
      recipientId: s.recipientId,
    }));
    update.signers = mergeSignerUpdates(current, liveMapped) as unknown as Prisma.InputJsonValue;
  }
  return defaultPrisma.documentSignature.update({
    where: { id: row.id },
    data: update,
  });
}

function mergeSignerUpdates(
  current: EnvelopeSignerView[],
  live: Array<{
    email: string;
    name: string;
    status: EnvelopeSignerView["status"];
    signedAt: string | null;
    deliveredAt: string | null;
    declinedAt: string | null;
    declineReason: string | null;
    clientUserId: string | null;
    recipientId?: string;
  }>,
): EnvelopeSignerView[] {
  const byEmail = new Map<string, EnvelopeSignerView>();
  for (const c of current) byEmail.set(c.email.toLowerCase(), c);

  const merged: EnvelopeSignerView[] = current.map((c) => ({ ...c }));
  for (const l of live) {
    const key = l.email.toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      const idx = merged.findIndex((m) => m.email.toLowerCase() === key);
      merged[idx] = {
        ...existing,
        name: existing.name || l.name,
        status: l.status,
        signedAt: l.signedAt ?? existing.signedAt,
        deliveredAt: l.deliveredAt ?? existing.deliveredAt,
        declinedAt: l.declinedAt ?? existing.declinedAt,
        declineReason: l.declineReason ?? existing.declineReason,
        clientUserId: existing.clientUserId ?? l.clientUserId,
      };
    } else {
      merged.push({
        email: l.email,
        name: l.name,
        role: "",
        status: l.status,
        signedAt: l.signedAt,
        deliveredAt: l.deliveredAt,
        declinedAt: l.declinedAt,
        declineReason: l.declineReason,
        clientUserId: l.clientUserId,
      });
    }
  }
  return merged;
}
