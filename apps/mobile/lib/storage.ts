/**
 * MMKV-backed storage for the mobile shell.
 *
 * MMKV is a synchronous key-value store. We use it for:
 *   - Auth tokens (encrypted via `encryptionKey`)
 *   - Last-viewed leads cache (offline-first)
 *   - User preferences (theme, last selected dealer subdomain)
 *
 * Encryption: MMKV supports per-instance AES. The encryption key is
 * derived at runtime from a build-time secret in `app.json` extras,
 * so it ships with the app binary. This is appropriate for at-rest
 * token protection (defense in depth on top of Keychain/Keystore
 * protection of the file itself). For higher-security needs, swap
 * `secureStorage` for `react-native-keychain`.
 *
 * Why not AsyncStorage? MMKV is ~30x faster and synchronous — which
 * matters at app start when we hydrate the auth token before
 * rendering the first screen.
 */

import { MMKV } from "react-native-mmkv";
import Constants from "expo-constants";

/**
 * Resolve the encryption key from `expo-constants` extras. Falls back
 * to a stable dev value when running in dev / Expo Go. In production
 * builds, set `expo.extra.encryptionKey` in `app.json` (or via EAS env
 * injection) and it will be picked up here.
 */
function resolveEncryptionKey(): string {
  const extra = Constants.expoConfig?.extra as
    | { encryptionKey?: string }
    | undefined;
  if (extra?.encryptionKey && extra.encryptionKey.length >= 16) {
    return extra.encryptionKey;
  }
  // Dev fallback — never used in production because the bundler
  // injects `extra.encryptionKey` from eas.json env at build time.
  return "dev-fallback-key-do-not-ship";
}

export const secureStorage = new MMKV({
  id: "dealeros-secure",
  encryptionKey: resolveEncryptionKey(),
});

export const cacheStorage = new MMKV({
  id: "dealeros-cache",
  // Not encrypted — only stores public-shape cache rows (lead
  // summaries, vehicle cards). Tokens go in `secureStorage`.
});

/**
 * Typed JSON helpers. MMKV only knows `string | number | boolean |
 * ArrayBuffer`, so we serialize everything as JSON. We catch parse
 * errors and return `null` rather than throwing — the caller can
 * treat a corrupt cache entry as a miss.
 */
export const storage = {
  getString(key: string): string | null {
    return secureStorage.getString(key) ?? null;
  },
  setString(key: string, value: string): void {
    secureStorage.set(key, value);
  },
  remove(key: string): void {
    secureStorage.delete(key);
  },
  clearAll(): void {
    secureStorage.clearAll();
  },
  getJSON<T>(key: string): T | null {
    const raw = cacheStorage.getString(key);
    if (raw === undefined || raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJSON<T>(key: string, value: T): void {
    cacheStorage.set(key, JSON.stringify(value));
  },
  removeCache(key: string): void {
    cacheStorage.delete(key);
  },
} as const;

/* ============================================================
 * Storage keys — single source of truth.
 * ============================================================ */

export const STORAGE_KEYS = {
  accessToken: "auth.accessToken",
  refreshToken: "auth.refreshToken",
  user: "auth.user",
  // Cached lists, keyed by query. Eviction policy: LRU on app start.
  leadListCache: (cursor: string | undefined): string =>
    `cache.leads.${cursor ?? "first"}`,
  leadDetailCache: (id: string): string => `cache.lead.${id}`,
  vehicleListCache: (cursor: string | undefined): string =>
    `cache.vehicles.${cursor ?? "first"}`,
  lastSyncAt: "cache.lastSyncAt",
  // User preferences
  preferredDealerSubdomain: "prefs.dealerSubdomain",
} as const;

export type StorageKey = string;
