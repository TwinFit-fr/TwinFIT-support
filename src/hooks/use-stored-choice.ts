"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * A choice remembered per browser in localStorage, shared live across components and tabs.
 * `parse` validates the stored JSON and returns null to fall back to `fallback`.
 */

const listeners = new Set<() => void>();
const written = new Map<string, string>();

function subscribeStorage(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key) written.delete(event.key);
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readStorage(key: string): string | null {
  if (written.has(key)) return written.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStoredChoice<T>(key: string, fallback: T, parse: (raw: unknown) => T | null) {
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => readStorage(key),
    () => null,
  );
  const value = useMemo(() => {
    if (raw == null) return fallback;
    try {
      return parse(JSON.parse(raw)) ?? fallback;
    } catch {
      return fallback;
    }
  }, [raw, fallback, parse]);
  const set = useCallback(
    (next: T) => {
      const json = JSON.stringify(next);
      written.set(key, json);
      try {
        localStorage.setItem(key, json);
      } catch {
        /* preference only */
      }
      listeners.forEach((notify) => notify());
    },
    [key],
  );
  return [value, set] as const;
}
