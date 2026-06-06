"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * useLocalStorage — typed localStorage hook that syncs state across tabs
 * and handles SSR (returns `initialValue` until hydrated).
 *
 * Falls back to in-memory state if `window.localStorage` is unavailable
 * (private mode, SSR, disabled storage).
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  // Read from storage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(JSON.parse(item) as T);
      }
    } catch (err) {
      // Quota exceeded, corrupt JSON, or storage disabled — keep initial value
      console.warn(`[useLocalStorage] Failed to read "${key}":`, err);
    }
    setHydrated(true);
  }, [key]);

  // Sync across tabs / windows
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue === null) return;
      try {
        setStoredValue(JSON.parse(e.newValue) as T);
      } catch {
        /* ignore corrupt payload from other tab */
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(key, JSON.stringify(next));
          } catch (err) {
            console.warn(`[useLocalStorage] Failed to write "${key}":`, err);
          }
        }
        return next;
      });
    },
    [key]
  );

  const remove = useCallback(() => {
    setStoredValue(initialValue);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(key);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, remove];
}

/** Returns true once the hook has read from localStorage (post-hydration). */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
