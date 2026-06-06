/**
 * Resolves API credentials for an outbound integration.
 *
 * Order of precedence:
 *   1. `dealer.settings.<key>` (encrypted blob — decryption handled
 *      upstream; we just read the JSON here)
 *   2. process.env fallback for local development
 *
 * This keeps the same code path working in dev (env vars) and prod
 * (per-dealer overrides from a connected-account flow).
 */

export interface CredentialResolution {
  value: string | null;
  source: "dealer" | "env" | "missing";
}

export function resolveCredential(
  dealerSettings: unknown,
  dealerKey: string,
  envKey: string,
): CredentialResolution {
  if (dealerSettings && typeof dealerSettings === "object") {
    const settings = dealerSettings as Record<string, unknown>;
    // Direct key
    const direct = settings[dealerKey];
    if (typeof direct === "string" && direct.length > 0) {
      return { value: direct, source: "dealer" };
    }
    // Nested under "whatsapp_credentials" or "meta_credentials"
    const buckets = [
      settings.credentials,
      settings.integrations,
      settings[dealerKey.replace(/Id$|Token$|Secret$/, "")],
    ];
    for (const b of buckets) {
      if (b && typeof b === "object") {
        const v = (b as Record<string, unknown>)[dealerKey];
        if (typeof v === "string" && v.length > 0) {
          return { value: v, source: "dealer" };
        }
      }
    }
  }
  const envV = process.env[envKey];
  if (envV && envV.length > 0) return { value: envV, source: "env" };
  return { value: null, source: "missing" };
}

/** Convenience: read env with fallback. */
export function envOr(key: string, fallback: string): string {
  return process.env[key] && process.env[key]!.length > 0
    ? (process.env[key] as string)
    : fallback;
}
