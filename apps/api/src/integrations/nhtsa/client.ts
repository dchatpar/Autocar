/**
 * NHTSA VPIC (Vehicle Product Information Catalog) client.
 *
 * Free, public REST API. No auth. Returns US vehicle specs given a
 * 17-char VIN. We hit the vPIC `decodeVinValues` endpoint, which
 * returns ~140 fields in a flat key/value array.
 *
 * Docs: https://vpic.nhtsa.dot.gov/api/
 *
 * Caching:
 *   - The server route caches results in-memory for 7 days keyed by
 *     `dealerId:vin` so a hot lot scanning the same cars across the
 *     sales team doesn't hammer VPIC.
 *   - Cache lives in process; restart invalidates. Good enough — VPIC
 *     is a public service that doesn't rate-limit by API key, but we
 *     still want to be a good citizen.
 *
 * Failure modes:
 *   - 4xx/5xx from VPIC → log + return null (route then returns an
 *     empty VinLookupResult with `source = "MANUAL"`)
 *   - Network timeout (5s) → same fallback
 *   - VIN not in VPIC database → return null (route returns
 *     `source: "MANUAL"`)
 *
 * Field selection:
 *   We only need a small subset of VPIC's 140 fields. We pull the
 *   few that matter and discard the rest — saves on payload size
 *   and makes the route's response shape stable.
 */

import { envOr } from "../shared/credentials.js";

const VPIC_BASE = envOr("NHTSA_VPIC_BASE", "https://vpic.nhtsa.dot.gov/api");
const VPIC_TIMEOUT_MS = Number(envOr("NHTSA_VPIC_TIMEOUT_MS", "5000"));
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface VpicDecodedVehicle {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine: string | null;
  engineCylinders: string | null;
  fuelType: string | null;
  bodyStyle: string | null;
  driveType: string | null;
  transmission: string | null;
  errorCode: string | null;
  errorText: string | null;
}

interface VpicFlatRow {
  Variable: string;
  Value: string | null;
  ValueId: string | null;
}

interface VpicResponse {
  Count: number;
  Message: string;
  SearchCriteria: string | null;
  Results: VpicFlatRow[];
}

interface CacheEntry {
  result: VpicDecodedVehicle | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(dealerId: string, vin: string): string {
  return `${dealerId}:${vin.toUpperCase()}`;
}

function readCache(
  dealerId: string,
  vin: string,
): VpicDecodedVehicle | null | undefined {
  const entry = cache.get(cacheKey(dealerId, vin));
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey(dealerId, vin));
    return undefined;
  }
  return entry.result;
}

function writeCache(
  dealerId: string,
  vin: string,
  result: VpicDecodedVehicle | null,
): void {
  cache.set(cacheKey(dealerId, vin), {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Decode a VIN via NHTSA VPIC.
 *
 * @param dealerId  Used as the cache namespace — different dealers
 *                  scanning the same VIN don't share a cache row, so
 *                  a misconfigured proxy that mutates responses per
 *                  tenant can't cross-contaminate.
 * @param vin       17-character VIN, already validated by the route.
 */
export async function decodeVin(
  dealerId: string,
  vin: string,
): Promise<VpicDecodedVehicle | null> {
  const cached = readCache(dealerId, vin);
  if (cached !== undefined) return cached;

  const normalized = vin.toUpperCase();
  const url = `${VPIC_BASE}/vehicles/decodevinvalues/${encodeURIComponent(
    normalized,
  )}?format=json`;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    VPIC_TIMEOUT_MS,
  );

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      writeCache(dealerId, vin, null);
      return null;
    }
    const body = (await res.json()) as VpicResponse;
    const result = extractFields(body);
    // VPIC returns ErrorCode "0" with a populated row on success, and
    // ErrorCode != "0" on partial failures (e.g. trim unknown). We
    // always return the best-effort result so the dealer can still
    // see whatever VPIC did manage to fill in.
    writeCache(dealerId, vin, result);
    return result;
  } catch {
    writeCache(dealerId, vin, null);
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function extractFields(body: VpicResponse): VpicDecodedVehicle {
  const row = body.Results[0];
  if (!row) {
    return {
      year: null,
      make: null,
      model: null,
      trim: null,
      engine: null,
      engineCylinders: null,
      fuelType: null,
      bodyStyle: null,
      driveType: null,
      transmission: null,
      errorCode: "EMPTY",
      errorText: "No results returned",
    };
  }
  // The flat-row format gives us one row with 140+ key/value pairs.
  // Field names are case-insensitive in practice; VPIC's docs use
  // PascalCase ("Make", "Model", "ModelYear"). We uppercase keys and
  // look up the camelCase API we expose to the rest of the codebase.
  const map: Record<string, string | null> = {};
  for (const r of body.Results) {
    map[r.Variable.toUpperCase()] = r.Value;
  }
  const pick = (key: string): string | null => {
    const v = map[key.toUpperCase()];
    return v && v.trim().length > 0 ? v.trim() : null;
  };
  const yearStr = pick("ModelYear");
  const cylinders = pick("EngineNumberOfCylinders");
  return {
    year: yearStr ? Number.parseInt(yearStr, 10) : null,
    make: pick("Make"),
    model: pick("Model"),
    trim: pick("Trim"),
    engine: [pick("DisplacementL"), cylinders]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join("L ") || null,
    engineCylinders: cylinders,
    fuelType: pick("FuelTypePrimary"),
    bodyStyle: pick("BodyClass"),
    driveType: pick("DriveType"),
    transmission: pick("TransmissionStyle"),
    errorCode: pick("ErrorCode"),
    errorText: pick("ErrorText"),
  };
}

/**
 * Test-only — clear the in-memory cache. Used by integration tests
 * to verify cache miss / hit transitions.
 */
export function __clearNhtsaCacheForTests(): void {
  cache.clear();
}

/**
 * Read cache stats — useful for a `/admin/integrations/nhtsa`
 * diagnostic route in the future.
 */
export function nhtsaCacheStats(): { size: number; ttlMs: number } {
  return { size: cache.size, ttlMs: CACHE_TTL_MS };
}
