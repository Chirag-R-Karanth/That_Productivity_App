import { useStoredPref, writeStored } from "@/lib/storedPref";

export type SyncPhase = "saved" | "pending" | "saving" | "issue";

export const SYNC_QUEUE_EVENT = "prodapp:sync-state";

const LAST_SYNC_KEY = "prodapp:last-sync-at";

/** Stable parser for `useLastSyncAt`; absent means "never synced". */
function parseLastSyncAt(raw: string | null): string | null {
  return raw;
}

/**
 * Last successful sync time, as a live value.
 *
 * This lives in localStorage, so it is read as an external store: a sync that
 * happens in any part of the app updates every mounted status strip without an
 * effect pushing the new value into state.
 */
export function useLastSyncAt(): string | null {
  const [value] = useStoredPref(LAST_SYNC_KEY, parseLastSyncAt, null);
  return value;
}

/** Broadcasts the current sync phase so the status strip stays live. */
export function emitSync(phase: SyncPhase) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SYNC_QUEUE_EVENT, { detail: { phase } }));
}

export function setLastSyncAt(iso: string = new Date().toISOString()) {
  if (typeof window === "undefined") return;
  writeStored(LAST_SYNC_KEY, iso);
}

export function getLastSyncAt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_SYNC_KEY);
}
