/**
 * Marketing-app API client.
 *
 * Fetches from the main DealerOS API (apps/api). Runs exclusively
 * on the server (no public tokens, no localStorage). Every call
 * targets a tenant-aware endpoint and includes the standard
 * `x-forwarded-for` and `user-agent` headers so the lead-capture
 * audit trail picks up the visitor's IP and browser.
 *
 * All helpers are async and throw `MarketingApiError` on non-2xx
 * responses so call sites can render graceful fallbacks.
 */

import "server-only";

const API_BASE =
  process.env.API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3001";

const ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_MARKETING_ROOT_DOMAIN ?? "dealeros.com";

/* ============================================================
 * Errors
 * ============================================================ */

export class MarketingApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, status: number, code: string = "unknown") {
    super(message);
    this.name = "MarketingApiError";
    this.status = status;
    this.code = code;
  }
}

interface ApiErrorBody {
  message?: string;
  code?: string;
  error?: { message?: string; code?: string };
}

/* ============================================================
 * Core request helper
 * ============================================================ */

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Cache-control override for Next.js data cache (e.g. "no-store"). */
  cache?: RequestCache;
  /**
   * Next.js fetch revalidation in seconds. Mirrors the
   * `next: { revalidate }` fetch option. If undefined, the route's
   * default applies.
   */
  revalidate?: number | false;
  /**
   * Arbitrary Next.js fetch init passthrough. Use for `next: { tags }`
   * to invalidate the cache from a Server Action.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  next?: { revalidate?: number | false; tags?: string[]; [k: string]: any };
}

function buildUrl(
  path: string,
  query?: RequestOptions["query"],
): string {
  const base = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, query, headers, signal, cache, revalidate, next } = options;

  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers ?? {}),
  };
  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const url = buildUrl(path, query);

  // Build the fetch init. Next.js 15 supports `next.revalidate` on
  // the fetch options; the marketing app uses it to opt inventory
  // pages into ISR.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchInit: any = {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  };
  if (cache) fetchInit.cache = cache;
  if (revalidate !== undefined) {
    fetchInit.next = { ...(fetchInit.next ?? {}), revalidate };
  }
  if (next) {
    fetchInit.next = { ...(fetchInit.next ?? {}), ...next };
  }

  let response: Response;
  try {
    response = await fetch(url, fetchInit);
  } catch (err) {
    throw new MarketingApiError(
      err instanceof Error ? err.message : "Network error",
      0,
      "network_error",
    );
  }

  if (!response.ok) {
    let payload: ApiErrorBody = {};
    try {
      payload = (await response.json()) as ApiErrorBody;
    } catch {
      // non-JSON
    }
    const message =
      payload.error?.message ??
      payload.message ??
      `Request failed with status ${response.status}`;
    const code = payload.error?.code ?? payload.code ?? `http_${response.status}`;
    throw new MarketingApiError(message, response.status, code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/* ============================================================
 * Public dealer-website reads
 * ============================================================ */

export interface ThemeConfig {
  logo?: string | null;
  primaryColor?: string;
  accentColor?: string;
  heroImage?: string | null;
  heroTitle?: string;
  heroSubtitle?: string;
  heroCtaText?: string;
  heroCtaHref?: string;
  aboutText?: string;
  footerLinks?: Array<{ label: string; href: string }>;
  fontFamily?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postal?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  hours?: Array<{ day: string; open: string; close: string }>;
}

export interface SeoConfig {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string | null;
  googleAnalyticsId?: string;
  facebookPixelId?: string;
  hreflang?: Array<{ lang: string; url: string }>;
}

export interface PublicDealerSite {
  dealer: {
    id: string;
    name: string;
    subdomain: string;
  };
  website: {
    id: string;
    dealerId: string;
    subdomain: string;
    themeConfig: ThemeConfig;
    seoConfig: SeoConfig;
    customDomain: string | null;
    isPublished: boolean;
  };
}

export async function resolveDealerSiteBySubdomain(
  subdomain: string,
): Promise<PublicDealerSite | null> {
  try {
    const res = await apiRequest<{ data: PublicDealerSite }>(
      `/public/dealer-website/${encodeURIComponent(subdomain)}`,
      {
        // Cached at the edge for 60s — same as the dealer-facing
        // inventory list. The site config is read-heavy, write-
        // rarely, so an aggressive cache is fine.
        next: { revalidate: 60, tags: [`site:${subdomain}`] },
      },
    );
    return res.data;
  } catch (err) {
    if (err instanceof MarketingApiError && (err.status === 404 || err.status === 0)) {
      return null;
    }
    throw err;
  }
}

export async function resolveDealerSiteByHost(
  host: string,
): Promise<PublicDealerSite | null> {
  try {
    const res = await apiRequest<{ data: PublicDealerSite }>(
      `/public/dealer-website/by-host/${encodeURIComponent(host)}`,
      { next: { revalidate: 60, tags: [`host:${host}`] } },
    );
    return res.data;
  } catch (err) {
    if (err instanceof MarketingApiError && (err.status === 404 || err.status === 0)) {
      return null;
    }
    throw err;
  }
}

/* ============================================================
 * Inventory reads (the public-facing endpoint is on the same
 * API, just under /inventory)
 * ============================================================ */

export interface PublicVehicle {
  id: string;
  vin: string;
  stockNumber: string | null;
  make: string;
  model: string;
  year: number;
  trim: string | null;
  bodyStyle: string | null;
  mileage: number | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  fuelType: string | null;
  transmission: string | null;
  drivetrain: string | null;
  engine: string | null;
  condition: "NEW" | "USED" | "CERTIFIED";
  status: "AVAILABLE" | "SOLD" | "PENDING" | "WHOLESALE";
  notes: string | null;
  pricing: {
    askingPrice: number | null;
    internetPrice: number | null;
    marketValue: number | null;
  } | null;
  media: Array<{
    id: string;
    cdnUrl: string | null;
    type: "PHOTO" | "VIDEO" | "SPIN360";
    isPrimary: boolean;
    sortOrder: number;
  }>;
  primaryPhotoUrl: string | null;
  daysOnLot: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryListResponse {
  data: PublicVehicle[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

export interface InventoryFilters {
  make?: string;
  model?: string;
  bodyStyle?: string;
  condition?: "NEW" | "USED" | "CERTIFIED";
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  maxMileage?: number;
  search?: string;
  cursor?: string;
  limit?: number;
  sort?: "newest" | "price-asc" | "price-desc" | "mileage-asc" | "year-desc";
}

export async function fetchDealerInventory(
  dealerId: string,
  filters: InventoryFilters = {},
  revalidateSeconds: number = 60,
): Promise<InventoryListResponse> {
  const res = await apiRequest<InventoryListResponse>(`/inventory`, {
    query: {
      status: "AVAILABLE",
      ...filters,
      // The /inventory endpoint takes dealerId implicitly via the
      // authenticated session. For the public marketing app we
      // pass it explicitly so the API tenant-scopes correctly.
      _dealerId: dealerId,
    } as Record<string, string | number | boolean | undefined | null>,
    revalidate: revalidateSeconds,
  });
  return res;
}

export async function fetchDealerVehicleByStock(
  dealerId: string,
  stockNumber: string,
): Promise<PublicVehicle | null> {
  try {
    // Use the listing endpoint and filter to a single vehicle. The
    // /inventory/:id endpoint requires a vehicle id, not a stock
    // number; the public URL is the stock number.
    const list = await apiRequest<InventoryListResponse>(`/inventory`, {
      query: {
        status: "AVAILABLE",
        search: stockNumber,
        limit: 5,
        _dealerId: dealerId,
      } as Record<string, string | number | boolean | undefined | null>,
      revalidate: 60,
    });
    const match = list.data.find(
      (v) => v.stockNumber?.toLowerCase() === stockNumber.toLowerCase(),
    );
    return match ?? null;
  } catch (err) {
    if (err instanceof MarketingApiError && (err.status === 404 || err.status === 0)) {
      return null;
    }
    throw err;
  }
}

export async function fetchDealerVehicleById(
  dealerId: string,
  vehicleId: string,
): Promise<PublicVehicle | null> {
  try {
    const res = await apiRequest<{ data: PublicVehicle }>(
      `/inventory/${vehicleId}`,
      { revalidate: 60 },
    );
    return res.data;
  } catch (err) {
    if (err instanceof MarketingApiError && (err.status === 404 || err.status === 0)) {
      return null;
    }
    throw err;
  }
}

/* ============================================================
 * Lead capture
 * ============================================================ */

export interface PublicLeadPayload {
  subdomain: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message?: string;
  vehicleStockNumber?: string;
  vehicleId?: string;
  sourceMeta?: Record<string, string | undefined>;
}

export interface FinanceApplicationPayload extends PublicLeadPayload {
  dob?: string;
  ssnLast4?: string;
  address?: Record<string, string | undefined>;
  employmentStatus?: string;
  monthlyIncome?: number;
  downPayment?: number;
  consentCreditCheck?: boolean;
}

export async function submitPublicLead(
  payload: PublicLeadPayload,
): Promise<{ id: string }> {
  const res = await apiRequest<{ data: { id: string } }>(
    `/public/dealer-website/${encodeURIComponent(payload.subdomain)}/lead`,
    { method: "POST", body: payload, cache: "no-store" },
  );
  return res.data;
}

export async function submitFinanceApplication(
  payload: FinanceApplicationPayload,
): Promise<{ leadId: string; customerId: string }> {
  const res = await apiRequest<{ data: { leadId: string; customerId: string } }>(
    `/public/dealer-website/${encodeURIComponent(payload.subdomain)}/finance-application`,
    { method: "POST", body: payload, cache: "no-store" },
  );
  return res.data;
}

/* ============================================================
 * Utility: build the absolute site origin
 * ============================================================ */

export function siteOrigin(subdomain: string): string {
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${protocol}://${subdomain}.${ROOT_DOMAIN}`;
}

export { API_BASE, ROOT_DOMAIN };
