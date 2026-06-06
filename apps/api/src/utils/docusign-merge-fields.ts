/**
 * DocuSign merge field substitution.
 *
 * DocuSign templates are configured (in the DocuSign UI or API) with
 * text tabs named after the `{{placeholder}}` keys below. When an
 * envelope is created from a template, we pass `templateTabs.textTabs`
 * (or `templateTabs.prefillTabs`) to inject values into those tabs
 * server-side, so the rendered document carries the deal/customer data.
 *
 * Why we don't do simple `string.replace`:
 *   - Tabs are typed (text, date, number, checkbox) — we want the
 *     data shape, not just the substring.
 *   - DocuSign stores the placeholder in the tab's `tabLabel`, not
 *     its `value`. We hand off a typed array.
 *   - We need a single source of truth for the supported field set
 *     so the frontend can render the right form, the backend can
 *     validate input, and the template setup doc can list them.
 *
 * Field set (kept in sync with the DocuSign template config in
 * `integrations/docusign/templates.ts`):
 *
 *   {{buyer_name}}         — full name of buyer
 *   {{buyer_email}}        — buyer email
 *   {{buyer_address}}      — buyer street address
 *   {{buyer_phone}}        — buyer phone (E.164)
 *   {{co_buyer_name}}      — co-buyer full name (optional)
 *   {{co_buyer_email}}     — co-buyer email (optional)
 *   {{seller_name}}        — seller / trade-in owner (optional)
 *   {{dealer_name}}        — dealership legal name
 *   {{dealer_address}}     — dealership address
 *   {{dealer_phone}}       — dealership phone
 *   {{vehicle_year}}       — e.g. "2024"
 *   {{vehicle_make}}       — e.g. "Toyota"
 *   {{vehicle_model}}      — e.g. "Camry"
 *   {{vehicle_trim}}       — e.g. "SE"
 *   {{vehicle_vin}}        — 17-char VIN
 *   {{vehicle_mileage}}    — e.g. "32,481"
 *   {{vehicle_color}}      — e.g. "Silver"
 *   {{sale_price}}         — currency string, e.g. "$28,995.00"
 *   {{down_payment}}       — currency string
 *   {{trade_value}}        — currency string
 *   {{trade_payoff}}       — currency string
 *   {{trade_allowance}}    — currency string (alias of trade_value)
 *   {{tax_amount}}         — currency string
 *   {{fee_total}}          — currency string
 *   {{financed_amount}}    — currency string
 *   {{monthly_payment}}    — currency string
 *   {{term_months}}        — plain integer as string
 *   {{rate}}               — percentage as string, e.g. "5.99%"
 *   {{apr}}                — same as rate, but APR-named for F&I templates
 *   {{lender}}             — lender name
 *   {{contract_date}}      — ISO date (YYYY-MM-DD)
 *   {{delivery_date}}      — ISO date (YYYY-MM-DD)
 *   {{warranty_provider}}  — e.g. "Ford Protect"
 *   {{warranty_term}}      — e.g. "36 months / 36,000 miles"
 *   {{warranty_deductible}} — currency string
 *   {{warranty_price}}     — currency string
 *   {{trade_vin}}          — trade-in VIN
 *   {{trade_year_make_model}} — e.g. "2019 Honda Civic EX"
 *   {{appraisal_date}}     — ISO date (YYYY-MM-DD)
 *   {{appraisal_value}}    — currency string
 *   {{credit_score}}       — plain integer as string (FICO)
 *   {{gross_cap_cost}}     — lease-only, currency string
 *   {{residual_value}}     — lease-only, currency string
 *   {{mileage_allowance}}  — lease-only, e.g. "12,000 mi/yr"
 *   {{manager_name}}       — sales/finance manager signing internally
 *   {{manager_email}}      — manager email
 *   {{deal_number}}        — internal deal/Jacket #
 *   {{dealer_license}}     — dealer license number
 */

export const MERGE_FIELD_KEYS = [
  "buyer_name",
  "buyer_email",
  "buyer_address",
  "buyer_phone",
  "co_buyer_name",
  "co_buyer_email",
  "seller_name",
  "dealer_name",
  "dealer_address",
  "dealer_phone",
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
  "trade_allowance",
  "tax_amount",
  "fee_total",
  "financed_amount",
  "monthly_payment",
  "term_months",
  "rate",
  "apr",
  "lender",
  "contract_date",
  "delivery_date",
  "warranty_provider",
  "warranty_term",
  "warranty_deductible",
  "warranty_price",
  "trade_vin",
  "trade_year_make_model",
  "appraisal_date",
  "appraisal_value",
  "credit_score",
  "gross_cap_cost",
  "residual_value",
  "mileage_allowance",
  "manager_name",
  "manager_email",
  "deal_number",
  "dealer_license",
] as const;

export type MergeFieldKey = (typeof MERGE_FIELD_KEYS)[number];

export type MergeFieldMap = Partial<Record<MergeFieldKey, string | number | null | undefined>>;

export type MergeFieldInput = Readonly<Record<string, string | number | null | undefined>>;

/**
 * Branded currency formatter. Produces "$28,995.00" style strings.
 * Pass `null` / `undefined` / `NaN` to get the empty string (so the
 * tab is left blank rather than showing "$0.00" in a F&I doc).
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "";
  if (!Number.isFinite(amount)) return "";
  try {
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function formatPercent(rate: number | null | undefined, decimals = 2): string {
  if (rate === null || rate === undefined) return "";
  if (!Number.isFinite(rate)) return "";
  return `${rate.toFixed(decimals)}%`;
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (!Number.isFinite(value)) return "";
  return Math.trunc(value).toString();
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/**
 * Normalize an input map to the strict set of `MERGE_FIELD_KEYS`,
 * trimming strings and treating empty strings as absent. Numeric
 * values are coerced via `toString()`. Anything else is dropped.
 *
 * Returns a `Record<MergeFieldKey, string>` so callers don't have
 * to deal with optional / null values when building DocuSign tabs.
 */
export function normalizeMergeFields(
  input: MergeFieldInput | MergeFieldMap,
): Record<MergeFieldKey, string> {
  const out = {} as Record<MergeFieldKey, string>;
  for (const key of MERGE_FIELD_KEYS) {
    const raw = input[key];
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > 0) out[key] = trimmed;
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      out[key] = String(raw);
    }
  }
  return out;
}

/**
 * Substitutes `{{key}}` placeholders in a free-text body (used for
 * the `emailMessage` and the `subject` DocuSign envelope fields, and
 * for previewing a document locally before sending).
 *
 * Unknown placeholders are left intact (so a doc with `{{not_a_field}}`
 * doesn't lose information silently).
 *
 * Examples:
 *   substitute("Hi {{buyer_name}}, here is the bill of sale", { buyer_name: "Alex" })
 *     → "Hi Alex, here is the bill of sale"
 */
export function substitute(
  template: string,
  fields: Readonly<Record<string, string | number | null | undefined>>,
): string {
  if (typeof template !== "string" || template.length === 0) return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const v = fields[key];
    if (v === null || v === undefined) return match;
    const s = typeof v === "string" ? v : String(v);
    return s.length > 0 ? s : match;
  });
}

/**
 * Build the DocuSign `templateTabs.textTabs` payload for a given
 * field map. We emit one tab per non-empty field, sharing the
 * `tabLabel` with the `{{placeholder}}` name so the DocuSign UI
 * setup matches the field name in the API call.
 *
 * Tab IDs are short hashes of the field name — DocuSign requires
 * them to be unique within a template.
 */
export function toDocuSignTextTabs(
  fields: Readonly<Record<MergeFieldKey, string>>,
): Array<{
  tabLabel: string;
  name: string;
  value: string;
  required: boolean;
  tabId: string;
}> {
  const tabs: Array<{
    tabLabel: string;
    name: string;
    value: string;
    required: boolean;
    tabId: string;
  }> = [];
  for (const key of MERGE_FIELD_KEYS) {
    const value = fields[key];
    if (!value) continue;
    tabs.push({
      tabLabel: `{{${key}}}`,
      name: key,
      value,
      required: false,
      tabId: shortHash(`field:${key}`),
    });
  }
  return tabs;
}

/**
 * Stable, non-cryptographic 8-char hash of an input. Used to generate
 * stable `tabId`s so the same merge field always maps to the same
 * DocuSign tab identifier (useful for idempotent re-sends).
 */
function shortHash(input: string): string {
  // FNV-1a 32-bit. Plenty for an identifier, not for security.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Unsigned hex, zero-padded to 8 chars.
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Validate a merge field map: returns the list of unsupported keys
 * (typos, deprecated names) so the caller can 400 with a useful
 * error rather than silently dropping data.
 */
export function findUnknownMergeFields(
  input: Readonly<Record<string, unknown>>,
): string[] {
  const known = new Set<string>(MERGE_FIELD_KEYS);
  return Object.keys(input).filter((k) => !known.has(k) && k.length > 0);
}
