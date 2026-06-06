/**
 * Campaign template engine — substitutes `{{var_name}}` placeholders
 * with values from the enrollment's lead / customer / dealer context.
 *
 * Two surfaces:
 *   - `renderTemplate(template, context)` → string. Pure function.
 *   - `extractVariables(template)` → string[]. Used by the editor UI
 *     to surface "which fields are referenced" for validation.
 *
 * Supported placeholders (built-in variables — see `BASE_VARS`):
 *   {{first_name}}, {{last_name}}, {{full_name}}, {{email}}, {{phone}}
 *   {{dealership_name}}, {{agent_name}}, {{unsubscribe_url}}
 *   Plus any custom key passed in `context.extra`.
 *
 * Missing variables resolve to "" (empty string) and a warning is
 * recorded in `renderTemplate`'s return metadata — we don't fail the
 * whole send on a typo.
 *
 * Unmatched braces (`{{foo`) are left as-is so the editor can detect
 * syntax issues visually. We never inject raw HTML — the caller
 * decides whether to use the output as text or HTML.
 */

import { prisma } from "./prisma.js";

/* ============================================================
 * Built-in variables
 * ============================================================ */

export interface TemplateContext {
  /** Lead context (first/last/email/phone). */
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Customer context (may overlap with lead for converted records). */
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  /** Dealership context. */
  dealershipName?: string | null;
  dealershipEmail?: string | null;
  dealershipPhone?: string | null;
  /** The rep assigned to the enrollment (if any). */
  agentName?: string | null;
  agentEmail?: string | null;
  /** Arbitrary custom variables (e.g. inventory items, deal terms). */
  extra?: Record<string, string | number | boolean | null | undefined>;
  /** Pre-rendered unsubscribe URL (campaigns must always include one). */
  unsubscribeUrl?: string | null;
}

export interface RenderResult {
  /** The rendered text. */
  text: string;
  /** Variables that were referenced but had no value. */
  missing: string[];
}

/* ============================================================
 * Variable pattern — `{{ name }}` or `{{name}}` with optional spaces.
 * Captures the inner identifier. We allow `[a-zA-Z0-9_.-]+` so custom
 * keys like `vehicle.make` are supported.
 * ============================================================ */

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.\-]*)\s*\}\}/g;

function lookup(
  ctx: TemplateContext,
  name: string,
): string | number | boolean | null | undefined {
  switch (name) {
    case "first_name":
      return ctx.firstName ?? ctx.customerFirstName ?? null;
    case "last_name":
      return ctx.lastName ?? ctx.customerLastName ?? null;
    case "full_name": {
      const first = ctx.firstName ?? ctx.customerFirstName ?? "";
      const last = ctx.lastName ?? ctx.customerLastName ?? "";
      const joined = `${first} ${last}`.trim();
      return joined.length > 0 ? joined : null;
    }
    case "email":
      return ctx.email ?? ctx.customerEmail ?? null;
    case "phone":
      return ctx.phone ?? ctx.customerPhone ?? null;
    case "dealership_name":
      return ctx.dealershipName ?? null;
    case "dealership_email":
      return ctx.dealershipEmail ?? null;
    case "dealership_phone":
      return ctx.dealershipPhone ?? null;
    case "agent_name":
      return ctx.agentName ?? null;
    case "agent_email":
      return ctx.agentEmail ?? null;
    case "unsubscribe_url":
      return ctx.unsubscribeUrl ?? null;
    default:
      return ctx.extra?.[name];
  }
}

/**
 * Render a template string by substituting `{{var}}` placeholders.
 * Missing variables become empty strings; their names are returned
 * in the `missing` array.
 */
export function renderTemplate(
  template: string,
  ctx: TemplateContext,
): RenderResult {
  if (!template) return { text: "", missing: [] };
  const missing = new Set<string>();
  const text = template.replace(PLACEHOLDER_RE, (_match, name: string) => {
    const value = lookup(ctx, name);
    if (value === null || value === undefined) {
      missing.add(name);
      return "";
    }
    return String(value);
  });
  return { text, missing: Array.from(missing).sort() };
}

/**
 * Return the unique variable names referenced in a template. Used by
 * the editor UI to render an "available variables" cheat sheet.
 */
export function extractVariables(template: string): string[] {
  if (!template) return [];
  const out = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const name = match[1];
    if (name) out.add(name);
  }
  return Array.from(out).sort();
}

/* ============================================================
 * Convenience: build a TemplateContext from a Prisma enrollment row.
 * Issues exactly 3 indexed queries (dealer + lead + customer +
 * assignedTo) and never returns a value that wasn't hydrated.
 * ============================================================ */

export interface EnrollmentHydration {
  dealerId: string;
  lead?: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    assignedTo?: { name: string; email: string } | null;
  } | null;
  customer?: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  } | null;
}

export async function buildContextFromEnrollment(
  h: EnrollmentHydration,
): Promise<TemplateContext> {
  const dealer = await prisma.dealer.findUnique({
    where: { id: h.dealerId },
    select: { name: true, settings: true },
  });

  const settings =
    dealer?.settings && typeof dealer.settings === "object"
      ? (dealer.settings as Record<string, unknown>)
      : {};

  // Settings may carry dealership contact info under any of these
  // common shapes; we accept whatever's there.
  const dealershipEmail = pickString(settings.dealershipEmail) ??
    pickString(settings.email) ??
    null;
  const dealershipPhone = pickString(settings.dealershipPhone) ??
    pickString(settings.phone) ??
    null;

  return {
    firstName: h.lead?.firstName ?? h.customer?.firstName ?? null,
    lastName: h.lead?.lastName ?? h.customer?.lastName ?? null,
    email: h.lead?.email ?? h.customer?.email ?? null,
    phone: h.lead?.phone ?? h.customer?.phone ?? null,
    customerFirstName: h.customer?.firstName ?? null,
    customerLastName: h.customer?.lastName ?? null,
    customerEmail: h.customer?.email ?? null,
    customerPhone: h.customer?.phone ?? null,
    dealershipName: dealer?.name ?? null,
    dealershipEmail,
    dealershipPhone,
    agentName: h.lead?.assignedTo?.name ?? null,
    agentEmail: h.lead?.assignedTo?.email ?? null,
    extra: {},
  };
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/* ============================================================
 * Constants — exposed so the editor can render the cheat sheet.
 * ============================================================ */

export const BASE_VARS: ReadonlyArray<{ name: string; description: string }> = [
  { name: "first_name", description: "Recipient's first name" },
  { name: "last_name", description: "Recipient's last name" },
  { name: "full_name", description: "Recipient's full name" },
  { name: "email", description: "Recipient's email address" },
  { name: "phone", description: "Recipient's phone number (E.164)" },
  { name: "dealership_name", description: "The dealer's name" },
  { name: "dealership_email", description: "Dealership contact email" },
  { name: "dealership_phone", description: "Dealership contact phone" },
  { name: "agent_name", description: "Assigned sales rep's name" },
  { name: "agent_email", description: "Assigned sales rep's email" },
  { name: "unsubscribe_url", description: "Pre-rendered unsubscribe link" },
];

/* ============================================================
 * Sanity check — used by tests to assert a template has a footer.
 * ============================================================ */

export function hasUnsubscribeFooter(template: string): boolean {
  if (!template) return false;
  return /\{\{\s*unsubscribe_url\s*\}\}/.test(template);
}
