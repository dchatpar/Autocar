/**
 * API client for DealerOS.
 *
 * Behaviour:
 * - Reads base URL from `NEXT_PUBLIC_API_URL` (defaults to http://localhost:3001).
 * - Injects the auth token from localStorage. (HttpOnly cookies will replace
 *   this once the backend is wired in.)
 * - Normalises errors into `ApiError` with status + code + message.
 * - On 401, clears the token and redirects to `/login`.
 *
 * While the backend is offline, pass `mockMode: true` to short-circuit and
 * return `null`. The hooks layer is responsible for serving mock data.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "http://localhost:3001";

const TOKEN_STORAGE_KEY = "dealeros.auth.token";

/* ------------------------------------------------------------------ */
/* Errors                                                             */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    status: number,
    code: string = "unknown",
    retryable: boolean = false,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

interface ApiErrorBody {
  message?: string;
  code?: string;
}

/* ------------------------------------------------------------------ */
/* Auth helpers                                                       */
/* ------------------------------------------------------------------ */

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

function clearAuthAndRedirect(): void {
  setAuthToken(null);
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect=${redirect}`;
  }
}

/* ------------------------------------------------------------------ */
/* Core request                                                       */
/* ------------------------------------------------------------------ */

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip the 401 → redirect behaviour (e.g. on /login). */
  skipAuthRedirect?: boolean;
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
  const { method = "GET", body, query, headers, signal, skipAuthRedirect } = options;

  const token = getAuthToken();
  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers ?? {}),
  };
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders["Content-Type"] = "application/json";
  }
  if (token) {
    requestHeaders["Authorization"] = `Bearer ${token}`;
  }

  const url = buildUrl(path, query);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
          ? body
          : JSON.stringify(body),
      signal,
      credentials: "include",
    });
  } catch (err) {
    // Network failure — likely no backend running yet.
    throw new ApiError(
      err instanceof Error ? err.message : "Network error",
      0,
      "network_error",
      true,
    );
  }

  if (response.status === 401) {
    if (!skipAuthRedirect) {
      clearAuthAndRedirect();
    }
    throw new ApiError("Authentication required", 401, "unauthorized", false);
  }

  if (!response.ok) {
    let payload: ApiErrorBody = {};
    try {
      payload = (await response.json()) as ApiErrorBody;
    } catch {
      // non-JSON error response
    }
    throw new ApiError(
      payload.message ?? `Request failed with status ${response.status}`,
      response.status,
      payload.code ?? `http_${response.status}`,
      response.status >= 500,
    );
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Convenience methods                                                */
/* ------------------------------------------------------------------ */

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PUT", body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),

  del: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};

export { API_BASE };
