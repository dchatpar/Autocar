"use client";

import { useEffect, useState } from "react";

/**
 * useDebounce — returns a value that only updates after `delay` ms of
 * inactivity. Useful for search inputs, autosave, URL state sync.
 *
 * Cleans up pending timer on unmount or when value/delay changes.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    if (delay <= 0) {
      setDebouncedValue(value);
      return;
    }

    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * useDebouncedCallback — debounces a function. The returned function
 * accepts the same arguments as the wrapped function.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number = 300
): (...args: TArgs) => void {
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [timer]);

  return (...args: TArgs) => {
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => fn(...args), delay));
  };
}
