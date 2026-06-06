/**
 * Auth store + hook for the mobile shell.
 *
 * Implemented as a Zustand store rather than React context so any
 * component can `useAuth()` without prop-drilling. The store is
 * hydrated synchronously at construction from MMKV — which is why
 * we picked MMKV over AsyncStorage (see lib/storage.ts).
 *
 * Lifecycle:
 *   1. App boot  → `hydrate()` reads the cached user from MMKV.
 *   2. Login    → `login(email, password)` calls the API, stores
 *                  the user, sets `status = "authenticated"`.
 *   3. Boot     → if a token is present on hydration, we call
 *                  `/auth/me` to verify it. If it fails, we wipe
 *                  tokens and fall back to the login screen.
 *   4. Logout   → calls the API, clears tokens + cache.
 */

import { create } from "zustand";
import { api, type AuthUser, ApiClientError } from "../lib/api";
import { storage, STORAGE_KEYS } from "../lib/storage";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  /** True if a login/logout request is in flight. */
  isSubmitting: boolean;

  /** Hydrate from MMKV + verify the token. */
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Imperative — used by the 401 handler in lib/api.ts. */
  reset: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  error: null,
  isSubmitting: false,

  async hydrate(): Promise<void> {
    const cached = storage.getJSON<AuthUser>(STORAGE_KEYS.user);
    const accessToken = storage.getString(STORAGE_KEYS.accessToken);
    if (!cached || !accessToken) {
      set({ status: "unauthenticated", user: null });
      return;
    }
    // Optimistic hydrate so the UI doesn't flash the login screen on
    // a warm start. The /auth/me call below will reconcile if the
    // token was actually invalid.
    set({ status: "authenticated", user: cached });
    try {
      const fresh = await api.me();
      set({ status: "authenticated", user: fresh, error: null });
    } catch (err) {
      if (err instanceof ApiClientError && err.isAuthError) {
        set({ status: "unauthenticated", user: null, error: null });
        return;
      }
      // Network blip — keep the cached user, surface a soft warning.
      set({
        status: "authenticated",
        user: cached,
        error:
          err instanceof Error
            ? `Offline — using cached profile (${err.message})`
            : "Offline — using cached profile",
      });
    }
  },

  async login(email, password): Promise<void> {
    set({ isSubmitting: true, error: null });
    try {
      const user = await api.login(email, password);
      set({ status: "authenticated", user, error: null, isSubmitting: false });
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Login failed";
      set({ error: message, isSubmitting: false });
      throw err;
    }
  },

  async logout(): Promise<void> {
    set({ isSubmitting: true });
    try {
      await api.logout();
    } finally {
      set({
        status: "unauthenticated",
        user: null,
        error: null,
        isSubmitting: false,
      });
    }
  },

  reset(): void {
    set({ status: "unauthenticated", user: null, error: null, isSubmitting: false });
  },
}));

/* ============================================================
 * Selectors — use these in components to keep subscriptions tight
 * ============================================================ */

export const selectIsAuthenticated = (s: AuthState): boolean =>
  s.status === "authenticated" && s.user !== null;

export const selectUserId = (s: AuthState): string | null => s.user?.id ?? null;
export const selectDealerId = (s: AuthState): string | null => s.user?.dealerId ?? null;
export const selectUserRole = (s: AuthState): string | null => s.user?.role ?? null;
