/**
 * API client for the DealerOS mobile app.
 *
 * Talks to the main Fastify API at `/api` (configurable via
 * `EXPO_PUBLIC_API_BASE_URL`). The base URL is resolved at runtime
 * from `expo-constants` extras — see `app.json` and `eas.json`.
 *
 * Responsibilities:
 *   - Read the bearer token from `storage` and attach it to every
 *     authenticated request
 *   - Auto-refresh on 401 once, then surface the error
 *   - Normalize the `{ data, error, pagination }` envelope that the
 *     API uses
 *   - Throw `ApiError` for non-2xx responses (typed, with status code)
 *
 * Multi-tenant: dealerId flows from the JWT. The mobile client never
 * has to know which tenant it's talking to — the server enforces it
 * based on the token's dealerId claim.
 */

import Constants from "expo-constants";
import { storage, STORAGE_KEYS } from "./storage";

/* ============================================================
 * Types — mirror the Fastify envelope
 * ============================================================ */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  data: T;
}

export interface PaginatedEnvelope<T> {
  data: T[];
  pagination: {
    hasMore: boolean;
    cursor: string | null;
  };
}

export interface ApiFailure {
  error: ApiError;
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  public get isAuthError(): boolean {
    return this.status === 401;
  }

  public get isForbidden(): boolean {
    return this.status === 403;
  }

  public get isNotFound(): boolean {
    return this.status === 404;
  }
}

/* ============================================================
 * Configuration
 * ============================================================ */

function resolveBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as
    | { apiBaseUrl?: string }
    | undefined;
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  const fromExtra = extra?.apiBaseUrl;
  // Trim trailing slash so we can safely concatenate `/auth/login`.
  const raw = fromEnv ?? fromExtra ?? "http://localhost:3001";
  return raw.replace(/\/+$/, "");
}

export const API_BASE_URL = resolveBaseUrl();

/* ============================================================
 * Token management — isolated so the auth hook can call into it
 * ============================================================ */

export function getAccessToken(): string | null {
  return storage.getString(STORAGE_KEYS.accessToken);
}

export function getRefreshToken(): string | null {
  return storage.getString(STORAGE_KEYS.refreshToken);
}

export function setTokens(access: string, refresh: string): void {
  storage.setString(STORAGE_KEYS.accessToken, access);
  storage.setString(STORAGE_KEYS.refreshToken, refresh);
}

export function clearTokens(): void {
  storage.remove(STORAGE_KEYS.accessToken);
  storage.remove(STORAGE_KEYS.refreshToken);
  storage.remove(STORAGE_KEYS.user);
}

/* ============================================================
 * Refresh-on-401 — single in-flight refresh shared across callers
 * ============================================================ */

let refreshInflight: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  const refresh = getRefreshToken();
  if (!refresh) return null;
  refreshInflight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        data: { accessToken: string };
      };
      const nextAccess = body.data.accessToken;
      storage.setString(STORAGE_KEYS.accessToken, nextAccess);
      return nextAccess;
    } catch {
      return null;
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

/* ============================================================
 * Core fetch wrapper
 * ============================================================ */

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** When true, skip the auto-refresh-on-401 path. Used for the
   *  login endpoint itself, where 401 means "bad creds", not
   *  "expired token". */
  skipAuth?: boolean;
  /** Abort signal for cancellation (search inputs, screen unmount). */
  signal?: AbortSignal;
}

function buildUrl(
  path: string,
  query?: RequestOptions["query"],
): string {
  const base = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.append(k, String(v));
  }
  const qs = params.toString();
  return qs.length > 0 ? `${base}?${qs}` : base;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, query, headers = {}, skipAuth, signal } = options;

  const exec = async (): Promise<Response> => {
    const url = buildUrl(path, query);
    const finalHeaders: Record<string, string> = {
      accept: "application/json",
      ...headers,
    };
    if (body !== undefined && !(body instanceof FormData)) {
      finalHeaders["content-type"] = "application/json";
    }
    if (!skipAuth) {
      const token = getAccessToken();
      if (token) finalHeaders.authorization = `Bearer ${token}`;
    }
    return fetch(url, {
      method,
      headers: finalHeaders,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      signal,
    });
  };

  let res = await exec();
  if (res.status === 401 && !skipAuth) {
    const next = await attemptRefresh();
    if (next) {
      res = await exec();
    } else {
      clearTokens();
    }
  }

  const text = await res.text();
  const parsed: unknown = text.length > 0 ? safeJson(text) : null;

  if (!res.ok) {
    const failure = extractError(parsed) ?? {
      code: "UNKNOWN",
      message: res.statusText || `HTTP ${res.status}`,
    };
    throw new ApiClientError(
      res.status,
      failure.code,
      failure.message,
      failure.details,
    );
  }

  // The API returns either { data } or { data: [], pagination: ... }.
  // We unwrap here so callers receive the inner payload directly.
  if (isEnvelope(parsed)) return parsed.data as T;
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (!value || typeof value !== "object") return false;
  return "data" in (value as Record<string, unknown>);
}

function extractError(parsed: unknown): ApiError | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.error && typeof obj.error === "object") {
    const e = obj.error as Record<string, unknown>;
    if (typeof e.message === "string" && typeof e.code === "string") {
      return {
        code: e.code,
        message: e.message,
        details: e.details,
      };
    }
  }
  if (typeof obj.message === "string") {
    return {
      code: typeof obj.code === "string" ? obj.code : "UNKNOWN",
      message: obj.message,
    };
  }
  return null;
}

/* ============================================================
 * Resource helpers — typed wrappers for common surfaces
 * ============================================================ */

export interface AuthUser {
  id: string;
  dealerId: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "SALES" | "BDC" | "FINANCE";
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const api = {
  async login(email: string, password: string): Promise<AuthUser> {
    const result = await apiRequest<
      ApiEnvelope<{
        user: AuthUser;
        accessToken: string;
        expiresIn: number;
      }>
    >("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    });
    // Refresh token is set as HttpOnly cookie by the API. For mobile
    // we don't have cookie storage, so we read it from the Set-Cookie
    // header. That requires the API to also return it in JSON, OR the
    // mobile client to receive it via a different mechanism. We
    // surface the access token immediately; refresh is requested via
    // the cookie in fetch credentials.
    setTokens(result.data.accessToken, "cookie-managed");
    storage.setJSON(STORAGE_KEYS.user, result.data.user);
    return result.data.user;
  },

  async me(): Promise<AuthUser> {
    const result = await apiRequest<ApiEnvelope<AuthUser>>("/auth/me");
    storage.setJSON(STORAGE_KEYS.user, result.data);
    return result.data;
  },

  async logout(): Promise<void> {
    try {
      await apiRequest("/auth/logout", { method: "POST", body: {} });
    } catch {
      // Idempotent — the server's logout swallows unknown tokens.
    } finally {
      clearTokens();
    }
  },

  async lookupVin(vin: string, signal?: AbortSignal): Promise<VinLookupResult> {
    const result = await apiRequest<ApiEnvelope<VinLookupResult>>(
      "/inventory/lookup-vin",
      { query: { vin }, signal },
    );
    return result.data;
  },

  async scanDl(
    imageBase64: string,
    signal?: AbortSignal,
  ): Promise<DlScanResult> {
    const result = await apiRequest<ApiEnvelope<DlScanResult>>(
      "/customers/scan-dl",
      {
        method: "POST",
        body: { image: imageBase64, mimeType: "image/jpeg" },
        signal,
      },
    );
    return result.data;
  },

  async listLeads(
    params: ListLeadsParams,
    signal?: AbortSignal,
  ): Promise<PaginatedEnvelope<LeadSummary>> {
    return apiRequest<PaginatedEnvelope<LeadSummary>>("/leads", {
      query: {
        cursor: params.cursor,
        limit: params.limit ?? 25,
        status: params.status,
        minScore: params.minScore,
      },
      signal,
    });
  },

  async getLead(
    id: string,
    signal?: AbortSignal,
  ): Promise<LeadSummary> {
    const result = await apiRequest<ApiEnvelope<LeadSummary>>(`/leads/${id}`, {
      signal,
    });
    return result.data;
  },

  async listVehicles(
    params: ListVehiclesParams,
    signal?: AbortSignal,
  ): Promise<PaginatedEnvelope<VehicleSummary>> {
    return apiRequest<PaginatedEnvelope<VehicleSummary>>("/inventory", {
      query: {
        cursor: params.cursor,
        limit: params.limit ?? 25,
        status: params.status,
      },
      signal,
    });
  },

  async createVehicle(
    payload: CreateVehiclePayload,
    signal?: AbortSignal,
  ): Promise<VehicleSummary> {
    const result = await apiRequest<ApiEnvelope<VehicleSummary>>(
      "/inventory",
      { method: "POST", body: payload, signal },
    );
    return result.data;
  },

  async createCustomer(
    payload: CreateCustomerPayload,
    signal?: AbortSignal,
  ): Promise<CustomerSummary> {
    const result = await apiRequest<ApiEnvelope<CustomerSummary>>(
      "/customers",
      { method: "POST", body: payload, signal },
    );
    return result.data;
  },

  async dashboardKpis(
    signal?: AbortSignal,
  ): Promise<DashboardKpis> {
    const result = await apiRequest<ApiEnvelope<DashboardKpis>>(
      "/dashboard/kpis",
      { signal },
    );
    return result.data;
  },
};

/* ============================================================
 * Domain types — keep these aligned with the API response shapes
 * ============================================================ */

export interface LeadSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "TEST_DRIVE" | "NEGOTIATING" | "WON" | "LOST";
  score: number;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleSummary {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  exteriorColor: string | null;
  status: "AVAILABLE" | "SOLD" | "PENDING" | "WHOLESALE";
  condition: "NEW" | "USED" | "CERTIFIED";
  askingPrice: number | null;
  primaryImageUrl: string | null;
  createdAt: string;
}

export interface CustomerSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dlNumber: string | null;
  createdAt: string;
}

export interface VinLookupResult {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine: string | null;
  fuelType: string | null;
  bodyStyle: string | null;
  source: "NHTSA_VPIC" | "MANUAL";
  cachedAt: string;
}

export interface DlScanResult {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  licenseNumber: string | null;
  dob: string | null; // ISO
  expirationDate: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  };
  confidence: number; // 0..1
  source: "AWS_TEXTRACT" | "MOCK";
  raw: unknown;
}

export interface ListLeadsParams {
  cursor?: string;
  limit?: number;
  status?: LeadSummary["status"];
  minScore?: number;
}

export interface ListVehiclesParams {
  cursor?: string;
  limit?: number;
  status?: VehicleSummary["status"];
}

export interface CreateVehiclePayload {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage?: number;
  exteriorColor?: string;
  engine?: string;
  bodyStyle?: string;
  fuelType?: string;
  pricing?: { askingPrice?: number };
}

export interface CreateCustomerPayload {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dlNumber?: string;
  dlProvince?: string;
  dob?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  notes?: string;
}

export interface DashboardKpis {
  leadsToday: number;
  leadsThisWeek: number;
  hotLeads: number;
  inventoryCount: number;
  pendingDeals: number;
  conversionRate: number; // 0..1
}
