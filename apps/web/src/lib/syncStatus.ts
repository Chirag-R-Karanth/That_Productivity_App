export type SyncPhase = "saved" | "pending" | "saving" | "issue";

export const SYNC_QUEUE_EVENT = "prodapp:sync-state";

const LAST_SYNC_KEY = "prodapp:last-sync-at";

/** Broadcasts the current sync phase so the status strip stays live. */
export function emitSync(phase: SyncPhase) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SYNC_QUEUE_EVENT, { detail: { phase } }));
}

export function setLastSyncAt(iso: string = new Date().toISOString()) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_SYNC_KEY, iso);
}

export function getLastSyncAt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_SYNC_KEY);
}