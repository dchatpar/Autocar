/**
 * DocuSign template definitions for the five core deal documents.
 *
 * The DocuSign templates themselves are authored in the DocuSign UI
 * (or via the Templates API) and identified by their `templateId`
 * GUID. This file is the *code-side* registry: the roles, expected
 * signers, subject/email defaults, and which merge fields apply.
 *
 * Per template, we define:
 *
 *   - id             — internal `DocumentType` enum value (from prisma)
 *   - slug           — kebab-case internal key (for routing + env)
 *   - displayName    — human-readable label for the UI
 *   - description    — short description for the "send for signature" modal
 *   - roles[]        — DocuSign template role names (must match the
 *                      role names set up in the DocuSign UI for the
 *                      corresponding template)
 *   - signingOrder   — "sequential" or "parallel"
 *   - mergeFields[]  — subset of MERGE_FIELD_KEYS this template
 *                      actually uses (used to drive the prefilled
 *                      form in the modal and to validate input)
 *   - subject        — default email subject (supports `{{placeholder}}`)
 *   - emailMessage   — default email body (supports `{{placeholder}}`)
 *   - templateIdEnv  — name of the env var that holds the
 *                      DocuSign template GUID for this document
 *
 * Resolving a template at request time uses `getTemplateBySlug(slug)`,
 * which reads the corresponding env var (`DOCUSIGN_TEMPLATE_*`) and
 * throws a `ServerError` if it's not configured. The DealDesk team
 * creates the templates in DocuSign and pastes the GUIDs into
 * `.env`.
 *
 * The five required templates:
 *
 *   - bill_of_sale     — Buyer, Manager countersign
 *   - fi_contract      — Buyer, Co-Buyer (optional), Finance Manager
 *   - credit_app       — Buyer only
 *   - warranty         — Buyer only
 *   - trade_appraisal  — Seller, Buyer
 */

import type { DocumentType, SignatureStatus } from "@prisma/client";
import { ServerError } from "../../utils/errors.js";
import { type MergeFieldKey } from "../../utils/docusign-merge-fields.js";

export type SigningOrder = "sequential" | "parallel";

export interface TemplateRole {
  /** DocuSign role name (must match the UI setup exactly). */
  name: string;
  /** Whether this role is required for a valid envelope. */
  required: boolean;
  /** Short description shown in the signers list. */
  description: string;
}

export interface TemplateDefinition {
  id: DocumentType;
  slug: string;
  displayName: string;
  description: string;
  roles: TemplateRole[];
  signingOrder: SigningOrder;
  /** The merge fields this template consumes. */
  mergeFields: ReadonlyArray<MergeFieldKey>;
  /** Default email subject (supports `{{placeholder}}`). */
  subject: string;
  /** Default email body (supports `{{placeholder}}`). */
  emailMessage: string;
  /** Env var name that holds the DocuSign template GUID. */
  templateIdEnv: string;
}

/* ============================================================
 * 1. Bill of Sale
 * ============================================================ */

const BILL_OF_SALE: TemplateDefinition = {
  id: "BILL_OF_SALE",
  slug: "bill_of_sale",
  displayName: "Bill of Sale",
  description:
    "Final sale contract between buyer and dealer. Buyer signs, manager countersigns.",
  roles: [
    {
      name: "Buyer",
      required: true,
      description: "The retail customer purchasing the vehicle.",
    },
    {
      name: "Manager",
      required: true,
      description: "Dealer sales manager or F&I manager countersigning.",
    },
  ],
  signingOrder: "sequential",
  mergeFields: [
    "buyer_name",
    "buyer_email",
    "buyer_address",
    "buyer_phone",
    "dealer_name",
    "dealer_address",
    "dealer_phone",
    "dealer_license",
    "vehicle_year",
    "vehicle_make",
    "vehicle_model",
    "vehicle_trim",
    "vehicle_vin",
    "vehicle_mileage",
    "vehicle_color",
    "sale_price",
    "down_payment",
    "trade_value",
    "trade_payoff",
    "tax_amount",
    "fee_total",
    "financed_amount",
    "contract_date",
    "manager_name",
    "manager_email",
    "deal_number",
  ],
  subject: "Please sign your Bill of Sale for {{vehicle_year}} {{vehicle_make}} {{vehicle_model}}",
  emailMessage:
    "Hi {{buyer_name}},\n\n" +
    "Please review and sign your bill of sale for the {{vehicle_year}} {{vehicle_make}} {{vehicle_model}} (VIN {{vehicle_vin}}).\n\n" +
    "Total: {{sale_price}}\nDeal #: {{deal_number}}\n\n" +
    "Thank you for your business,\n{{dealer_name}}",
  templateIdEnv: "DOCUSIGN_TEMPLATE_BILL_OF_SALE",
};

/* ============================================================
 * 2. F&I Contract
 * ============================================================ */

const FI_CONTRACT: TemplateDefinition = {
  id: "FI_CONTRACT",
  slug: "fi_contract",
  displayName: "F&I Contract",
  description:
    "Finance & Insurance contract. Buyer + optional co-buyer sign; finance manager countersigns.",
  roles: [
    {
      name: "Buyer",
      required: true,
      description: "Primary borrower.",
    },
    {
      name: "Co-Buyer",
      required: false,
      description: "Co-borrower, if any.",
    },
    {
      name: "Finance Manager",
      required: true,
      description: "F&I manager or finance director countersigning.",
    },
  ],
  signingOrder: "sequential",
  mergeFields: [
    "buyer_name",
    "buyer_email",
    "buyer_address",
    "buyer_phone",
    "co_buyer_name",
    "co_buyer_email",
    "dealer_name",
    "dealer_address",
    "dealer_phone",
    "vehicle_year",
    "vehicle_make",
    "vehicle_model",
    "vehicle_vin",
    "sale_price",
    "down_payment",
    "trade_value",
    "trade_payoff",
    "tax_amount",
    "fee_total",
    "financed_amount",
    "monthly_payment",
    "term_months",
    "apr",
    "rate",
    "lender",
    "contract_date",
    "manager_name",
    "manager_email",
    "deal_number",
  ],
  subject: "Your F&I contract for {{vehicle_year}} {{vehicle_make}} {{vehicle_model}}",
  emailMessage:
    "Hi {{buyer_name}},\n\n" +
    "Please review and sign your finance contract for the {{vehicle_year}} {{vehicle_make}} {{vehicle_model}}.\n\n" +
    "Amount financed: {{financed_amount}}\n" +
    "Term: {{term_months}} months at {{apr}} APR\n" +
    "Monthly payment: {{monthly_payment}}\n\n" +
    "Thank you,\n{{dealer_name}}",
  templateIdEnv: "DOCUSIGN_TEMPLATE_FI_CONTRACT",
};

/* ============================================================
 * 3. Credit Application
 * ============================================================ */

const CREDIT_APP: TemplateDefinition = {
  id: "CREDIT_APP",
  slug: "credit_app",
  displayName: "Credit Application",
  description: "Credit application. Buyer signs only.",
  roles: [
    {
      name: "Buyer",
      required: true,
      description: "The retail customer applying for credit.",
    },
  ],
  signingOrder: "sequential",
  mergeFields: [
    "buyer_name",
    "buyer_email",
    "buyer_address",
    "buyer_phone",
    "dealer_name",
    "dealer_address",
    "credit_score",
    "contract_date",
    "deal_number",
  ],
  subject: "Sign your credit application — {{dealer_name}}",
  emailMessage:
    "Hi {{buyer_name}},\n\n" +
    "Please complete and sign your credit application with {{dealer_name}}.\n\n" +
    "Thank you,\n{{dealer_name}}",
  templateIdEnv: "DOCUSIGN_TEMPLATE_CREDIT_APP",
};

/* ============================================================
 * 4. Warranty Agreement
 * ============================================================ */

const WARRANTY: TemplateDefinition = {
  id: "WARRANTY",
  slug: "warranty",
  displayName: "Warranty Agreement",
  description: "Extended warranty / service contract. Buyer signs only.",
  roles: [
    {
      name: "Buyer",
      required: true,
      description: "The retail customer purchasing the warranty.",
    },
  ],
  signingOrder: "sequential",
  mergeFields: [
    "buyer_name",
    "buyer_email",
    "buyer_address",
    "buyer_phone",
    "dealer_name",
    "dealer_address",
    "vehicle_year",
    "vehicle_make",
    "vehicle_model",
    "vehicle_vin",
    "vehicle_mileage",
    "warranty_provider",
    "warranty_term",
    "warranty_deductible",
    "warranty_price",
    "monthly_payment",
    "term_months",
    "contract_date",
    "deal_number",
  ],
  subject: "Your warranty for {{vehicle_year}} {{vehicle_make}} {{vehicle_model}}",
  emailMessage:
    "Hi {{buyer_name}},\n\n" +
    "Please review and sign your {{warranty_term}} warranty for the {{vehicle_year}} {{vehicle_make}} {{vehicle_model}}.\n\n" +
    "Provider: {{warranty_provider}}\n" +
    "Price: {{warranty_price}}\n\n" +
    "Thank you,\n{{dealer_name}}",
  templateIdEnv: "DOCUSIGN_TEMPLATE_WARRANTY",
};

/* ============================================================
 * 5. Trade Appraisal
 * ============================================================ */

const TRADE_APPRAISAL: TemplateDefinition = {
  id: "TRADE_APPRAISAL",
  slug: "trade_appraisal",
  displayName: "Trade Appraisal",
  description:
    "Trade-in vehicle appraisal. Seller (current owner) and Buyer (dealer) sign.",
  roles: [
    {
      name: "Seller",
      required: true,
      description: "Current owner of the trade-in vehicle.",
    },
    {
      name: "Buyer",
      required: true,
      description: "Dealership representative purchasing the trade-in.",
    },
  ],
  signingOrder: "sequential",
  mergeFields: [
    "seller_name",
    "buyer_name",
    "buyer_email",
    "dealer_name",
    "dealer_address",
    "dealer_phone",
    "trade_vin",
    "trade_year_make_model",
    "trade_value",
    "trade_allowance",
    "appraisal_date",
    "appraisal_value",
    "vehicle_mileage",
    "deal_number",
  ],
  subject: "Trade-in appraisal for {{trade_year_make_model}} — {{dealer_name}}",
  emailMessage:
    "Hi {{seller_name}},\n\n" +
    "{{dealer_name}} has appraised your {{trade_year_make_model}} (VIN {{trade_vin}}) at {{appraisal_value}}.\n\n" +
    "Please review and sign the trade appraisal form.\n\n" +
    "Thank you,\n{{dealer_name}}",
  templateIdEnv: "DOCUSIGN_TEMPLATE_TRADE_APPRAISAL",
};

/* ============================================================
 * Registry
 * ============================================================ */

export const TEMPLATES: ReadonlyArray<TemplateDefinition> = [
  BILL_OF_SALE,
  FI_CONTRACT,
  CREDIT_APP,
  WARRANTY,
  TRADE_APPRAISAL,
];

export const TEMPLATES_BY_SLUG: Readonly<Record<string, TemplateDefinition>> =
  Object.freeze(
    TEMPLATES.reduce<Record<string, TemplateDefinition>>((acc, t) => {
      acc[t.slug] = t;
      return acc;
    }, {}),
  );

export const TEMPLATES_BY_ID: Readonly<Record<DocumentType, TemplateDefinition>> =
  Object.freeze(
    TEMPLATES.reduce<Record<DocumentType, TemplateDefinition>>((acc, t) => {
      acc[t.id] = t;
      return acc;
    }, {} as Record<DocumentType, TemplateDefinition>),
  );

/* ============================================================
 * Lookup helpers
 * ============================================================ */

export function getTemplateBySlug(slug: string): TemplateDefinition {
  const t = TEMPLATES_BY_SLUG[slug];
  if (!t) {
    throw new ServerError(`Unknown DocuSign template slug: ${slug}`, {
      knownSlugs: Object.keys(TEMPLATES_BY_SLUG),
    });
  }
  return t;
}

export function getTemplateByDocumentType(id: DocumentType): TemplateDefinition {
  const t = TEMPLATES_BY_ID[id];
  if (!t) {
    throw new ServerError(`No DocuSign template for DocumentType: ${id}`);
  }
  return t;
}

/**
 * Resolve the DocuSign template GUID for a slug. Reads the env
 * var named in the template's `templateIdEnv`. Throws `ServerError`
 * with a developer-friendly message if not configured.
 */
export function resolveDocuSignTemplateId(slug: string): string {
  const t = getTemplateBySlug(slug);
  const id = process.env[t.templateIdEnv];
  if (!id || id.trim().length === 0) {
    throw new ServerError(
      `DocuSign template GUID not configured: set ${t.templateIdEnv} in env`,
      { slug, envVar: t.templateIdEnv },
    );
  }
  return id.trim();
}

/* ============================================================
 * Public list (for the "send for signature" modal)
 * ============================================================ */

export interface TemplateListItem {
  slug: string;
  documentType: DocumentType;
  displayName: string;
  description: string;
  roles: TemplateRole[];
  signingOrder: SigningOrder;
  mergeFields: ReadonlyArray<MergeFieldKey>;
  configured: boolean;
}

export function listTemplates(): TemplateListItem[] {
  return TEMPLATES.map((t) => ({
    slug: t.slug,
    documentType: t.id,
    displayName: t.displayName,
    description: t.description,
    roles: t.roles,
    signingOrder: t.signingOrder,
    mergeFields: t.mergeFields,
    configured: Boolean(process.env[t.templateIdEnv]?.trim()),
  }));
}

/* ============================================================
 * Status helpers
 * ============================================================ */

/**
 * Map a DocuSign envelope-level status string to our enum.
 * DocuSign returns the live status on `Envelope.status`; we
 * also receive events via webhook. The mapping is deliberately
 * permissive — unknown statuses are passed through as `CREATED`
 * with a logged warning rather than failing.
 */
export function mapDocuSignEnvelopeStatus(
  raw: string | null | undefined,
): SignatureStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "created":
      return "CREATED";
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "completed":
      return "COMPLETED";
    case "declined":
      return "DECLINED";
    case "voided":
      return "VOIDED";
    case "expired":
      return "EXPIRED";
    default:
      return "CREATED";
  }
}

/**
 * Map a DocuSign recipient-level status to our string union
 * (used inside the `signers` JSON column).
 */
export function mapDocuSignRecipientStatus(
  raw: string | null | undefined,
): "created" | "sent" | "delivered" | "completed" | "declined" {
  switch ((raw ?? "").toLowerCase()) {
    case "created":
      return "created";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "completed":
    case "signed":
      return "completed";
    case "declined":
      return "declined";
    default:
      return "sent";
  }
}
