/**
 * DocuSign JWT Grant authentication.
 *
 * DocuSign supports two server-to-server auth flows:
 *
 *   1. OAuth Authorization Code Grant — requires an interactive
 *      consent screen the first time. Not suitable for headless
 *      server workloads.
 *
 *   2. JWT Grant — we sign a short-lived JWT with our integration
 *      key's RSA private key and exchange it for an access token
 *      at `oauth/token`. The integration key must be configured
 *      (in DocuSign Admin → Apps and Keys) to allow JWT grant and
 *      have consent granted by a DocuSign admin for the account.
 *
 * We use the JWT grant because:
 *   - It's headless / no UI redirect.
 *   - It produces an access token with a 1-hour lifetime that we
 *     can cache and refresh in-process.
 *   - The SDK ships a built-in `requestJWTUserToken` helper that
 *     builds and signs the JWT for us.
 *
 * References:
 *   - https://developers.docusign.com/platform/auth/jwt/jwt-get-token/
 *   - https://developers.docusign.com/platform/auth/jwt/jwt-create-token/
 *
 * Token caching:
 *   - The SDK returns an `accessToken` and `expiresIn` (seconds).
 *   - We cache until `expiresIn - 60s` (1-minute safety margin) so
 *     long-running background jobs don't get a 401 mid-call.
 *   - Cache is in-process only — DocuSign tokens are short-lived
 *     and per-process, and we never need to share them.
 *
 * Configuration (env):
 *   - DOCUSIGN_INTEGRATION_KEY    (the "client id" of the app)
 *   - DOCUSIGN_USER_ID            (the API username GUID)
 *   - DOCUSIGN_ACCOUNT_ID         (DocuSign account GUID, often the
 *                                  same as the API username unless
 *                                  using a sub-account)
 *   - DOCUSIGN_BASE_PATH          (e.g. "https://demo.docusign.net/restapi"
 *                                  or the production host)
 *   - DOCUSIGN_OAUTH_BASE_PATH    (e.g. "account-d.docusign.com" for demo,
 *                                  "account.docusign.com" for prod)
 *   - DOCUSIGN_PRIVATE_KEY        (the RSA private key, PEM-encoded)
 *                                  OR
 *   - DOCUSIGN_PRIVATE_KEY_PATH   (path to a PEM file)
 *   - DOCUSIGN_AUTH_SCOPE         (default "signature")
 *
 * In test/dev (no keys configured), the helpers will throw a
 * descriptive error rather than silently falling back to anonymous
 * access — DocuSign does not allow unauthenticated API calls.
 */

import * as fs from "node:fs";
import * as crypto from "node:crypto";
import docusign from "docusign-esign";

import { ServerError } from "../../utils/errors.js";

const DEFAULT_SCOPE = "signature";
/** Safety margin so we refresh tokens 60s before they expire. */
const EXPIRY_BUFFER_MS = 60_000;

export interface DocuSignConfig {
  integrationKey: string;
  userId: string;
  accountId: string;
  basePath: string;
  oauthBasePath: string;
  privateKey: string;
  scope: string;
}

export interface JwtToken {
  accessToken: string;
  /** Epoch ms when the token expires (with our safety margin applied). */
  expiresAtMs: number;
  /** The raw expiresIn from DocuSign, in seconds, for logging. */
  expiresIn: number;
}

/**
 * Read the DocuSign integration config from environment variables.
 * Throws `ServerError` if anything required is missing — we'd rather
 * fail loudly at boot than 500 on the first signed envelope.
 */
export function loadDocuSignConfig(): DocuSignConfig {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const userId = process.env.DOCUSIGN_USER_ID;
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  const basePath = process.env.DOCUSIGN_BASE_PATH;
  const oauthBasePath = process.env.DOCUSIGN_OAUTH_BASE_PATH;
  const privateKey = readPrivateKey();

  if (!integrationKey) {
    throw new ServerError("DOCUSIGN_INTEGRATION_KEY is not configured", {
      env: "DOCUSIGN_INTEGRATION_KEY",
    });
  }
  if (!userId) {
    throw new ServerError("DOCUSIGN_USER_ID is not configured", {
      env: "DOCUSIGN_USER_ID",
    });
  }
  if (!accountId) {
    throw new ServerError("DOCUSIGN_ACCOUNT_ID is not configured", {
      env: "DOCUSIGN_ACCOUNT_ID",
    });
  }
  if (!basePath) {
    throw new ServerError("DOCUSIGN_BASE_PATH is not configured", {
      env: "DOCUSIGN_BASE_PATH",
    });
  }
  if (!oauthBasePath) {
    throw new ServerError("DOCUSIGN_OAUTH_BASE_PATH is not configured", {
      env: "DOCUSIGN_OAUTH_BASE_PATH",
    });
  }
  if (!privateKey) {
    throw new ServerError(
      "DocuSign RSA private key is not configured (DOCUSIGN_PRIVATE_KEY or DOCUSIGN_PRIVATE_KEY_PATH)",
    );
  }

  return {
    integrationKey,
    userId,
    accountId,
    basePath: basePath.replace(/\/+$/, ""),
    oauthBasePath: oauthBasePath.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    privateKey,
    scope: process.env.DOCUSIGN_AUTH_SCOPE ?? DEFAULT_SCOPE,
  };
}

function readPrivateKey(): string | null {
  const inline = process.env.DOCUSIGN_PRIVATE_KEY;
  if (inline && inline.trim().length > 0) {
    // Support escaped newlines for Heroku/Docker-style single-line env.
    return inline.includes("\\n") ? inline.replace(/\\n/g, "\n") : inline;
  }
  const path = process.env.DOCUSIGN_PRIVATE_KEY_PATH;
  if (path && path.trim().length > 0) {
    try {
      return fs.readFileSync(path, "utf8");
    } catch (err) {
      throw new ServerError(
        `Failed to read DOCUSIGN_PRIVATE_KEY_PATH: ${(err as Error).message}`,
        { path },
      );
    }
  }
  return null;
}

/**
 * Verify the private key parses as a valid RSA key in PKCS#8 / PKCS#1.
 * Cheap validation — runs once on module init when `loadDocuSignConfig`
 * is called the first time.
 */
export function validatePrivateKey(pem: string): void {
  try {
    const key = crypto.createPrivateKey(pem);
    if (key.asymmetricKeyType !== "rsa") {
      throw new Error(`expected RSA, got ${key.asymmetricKeyType}`);
    }
  } catch (err) {
    throw new ServerError(
      `Invalid DocuSign private key: ${(err as Error).message}`,
    );
  }
}

/**
 * In-process token cache. One process, one DocuSign account → one
 * active token. The `Mutex` pattern is overkill for single-threaded
 * Node, but we still guard against the second concurrent caller
 * racing with the first (both miss the cache, both fetch).
 */
class TokenCache {
  private current: JwtToken | null = null;
  private inflight: Promise<JwtToken> | null = null;

  get(): JwtToken | null {
    if (!this.current) return null;
    if (Date.now() >= this.current.expiresAtMs) {
      this.current = null;
      return null;
    }
    return this.current;
  }

  set(token: JwtToken): void {
    this.current = token;
    this.inflight = null;
  }

  /**
   * Get-or-fetch: if a token is in-flight, all callers await the
   * same promise (no duplicate auth calls). If we have a fresh
   * token, return it. Otherwise kick off a refresh.
   */
  async getOrFetch(fetcher: () => Promise<JwtToken>): Promise<JwtToken> {
    const cached = this.get();
    if (cached) return cached;
    if (this.inflight) return this.inflight;
    this.inflight = fetcher().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  clear(): void {
    this.current = null;
  }
}

const tokenCache = new TokenCache();

/**
 * Request a JWT access token from DocuSign using the integration's
 * RSA private key. Caches the result in-process.
 *
 * The SDK's `requestJWTUserToken(integrationKey, userId, scopes, key, expiresIn)`
 * builds and signs the JWT for us.
 */
export async function getAccessToken(
  cfg: DocuSignConfig = loadDocuSignConfig(),
): Promise<string> {
  const token = await tokenCache.getOrFetch(async () => fetchToken(cfg));
  return token.accessToken;
}

/**
 * Force-refresh the token (used after a 401 from DocuSign so the
 * next call gets a fresh one, and for tests).
 */
export async function refreshAccessToken(
  cfg: DocuSignConfig = loadDocuSignConfig(),
): Promise<string> {
  tokenCache.clear();
  return getAccessToken(cfg);
}

async function fetchToken(cfg: DocuSignConfig): Promise<JwtToken> {
  validatePrivateKey(cfg.privateKey);

  // docusign-esign's OAuth instance takes the apiClient so it can
  // use the same TLS / proxy config. We point its base path at the
  // OAuth host (account-d.docusign.com for the demo environment).
  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(cfg.oauthBasePath);

  let raw: { body?: { access_token?: string; expires_in?: number } } & Record<
    string,
    unknown
  >;
  try {
    raw = (await apiClient.requestJWTUserToken(
      cfg.integrationKey,
      cfg.userId,
      [cfg.scope],
      Buffer.from(cfg.privateKey, "utf8"),
      3600, // 1h — DocuSign's hard cap
    )) as typeof raw;
  } catch (err) {
    throw new ServerError(
      `DocuSign JWT auth failed: ${(err as Error).message}`,
      { integrationKey: cfg.integrationKey, userId: cfg.userId },
    );
  }

  const body = (raw?.body ?? {}) as { access_token?: string; expires_in?: number };
  const accessToken = body.access_token;
  const expiresIn = body.expires_in;
  if (!accessToken || typeof accessToken !== "string") {
    throw new ServerError("DocuSign JWT response missing access_token", {
      bodyKeys: Object.keys(body),
    });
  }
  const expiresInSec = typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 3600;

  return {
    accessToken,
    expiresAtMs: Date.now() + expiresInSec * 1000 - EXPIRY_BUFFER_MS,
    expiresIn: expiresInSec,
  };
}

/**
 * Test-only helper: wipe the in-process token cache. Used by unit
 * tests to force re-auth.
 */
export function __resetTokenCache(): void {
  tokenCache.clear();
}
