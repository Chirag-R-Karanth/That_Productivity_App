"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage as a React external store.
 *
 * A persisted preference is state that lives outside React, so it belongs in
 * `useSyncExternalStore` rather than being read inside an effect and pushed into
 * component state. That removes the cascading-render setState-on-mount pattern
 * and gets two things the effect version did not have: correct values in other
 * tabs, and no hydration flash, because React re-reads the store once the
 * client snapshot differs from the server's.
 *
 * `parse` must be a stable, module-level function so the snapshot identity does
 * not change between renders. It must return a primitive or an otherwise
 * referentially stable value, since React compares snapshots with `Object.is`.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

function notifyAll() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: Listener): () => void {
  listeners.add(onChange);
  if (listeners.size === 1 && typeof window !== "undefined") {
    // Other tabs writing the same key is the one update we cannot see ourselves.
    window.addEventListener("storage", onChange);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onChange);
    }
  };
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode / disabled storage: behave as if unset rather than throw.
    return null;
  }
}

/** Non-reactive read, for code that is not rendering (event handlers, etc). */
export function readStored<T>(key: string, parse: (raw: string | null) => T, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return parse(readRaw(key));
}

/** Write and re-render every subscriber in this tab. */
export function writeStored(key: string, raw: string): void {
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    /* storage unavailable; the in-memory value still updates below */
  }
  notifyAll();
}

export function useStoredPref<T>(
  key: string,
  parse: (raw: string | null) => T,
  fallback: T,
): [T, (raw: string) => void] {
  const getSnapshot = useCallback(() => readStored(key, parse, fallback), [key, parse, fallback]);
  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);
  const setValue = useCallback((raw: string) => writeStored(key, raw), [key]);
  return [value, setValue];
}
