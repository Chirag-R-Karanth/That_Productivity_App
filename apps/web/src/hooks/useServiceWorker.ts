"use client";

import { useEffect } from "react";
import { api, setAuthToken, getAuthToken } from "@/lib/api";
import { pushAction, getPendingActions, removeAction } from "@/lib/offlineQueue";
import { emitSync, setLastSyncAt } from "@/lib/syncStatus";
import { reregisterPush } from "@/lib/push";

const SYNC_TAG = "prodapp-flush";
const AUTH_TOKEN_STORAGE_KEY = "token";

function setAuthTokenFromStorage() {
  if (typeof window === "undefined") return;
  const t = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (t) setAuthToken(t);
}

/**
 * Registers the service worker and coordinates the offline queue.
 *
 * Flow:
 * - SW is registered once; background sync ("prodapp-flush") and the browser
 *   "online" event both trigger replayOfflineQueue(), which re-sends any
 *   mutations that were queued while offline.
 * - After a successful replay (or receiver-initiated queue-flush message) a
 *   "sync-refresh" window event is emitted so pages can refetch their data.
 */
export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    setAuthTokenFromStorage();

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if ("sync" in reg) {
          navigator.serviceWorker.ready
            .then((r) => {
              const sync = (r as unknown as {
                sync?: { register: (t: string) => Promise<void> };
              }).sync;
              if (sync) return sync.register(SYNC_TAG);
            })
            .catch(() => {});
        }
      })
      .catch((err) => console.warn("SW registration failed", err));

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "queue-flushed") {
        void replayOfflineQueue();
      }
      // The browser voided its push subscription. Hand the new address (if any)
      // straight back to the server so notifications keep arriving instead of
      // stopping silently.
      if (event.data?.type === "push-invalidated") {
        void reregisterPush();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    // Replay immediately when the connection comes back.
    const onOnline = () => {
      void replayOfflineQueue();
    };
    window.addEventListener("online", onOnline);

    // Replay once on app start in case we loaded while offline.
    void replayOfflineQueue();

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("online", onOnline);
    };
  }, []);
}

/**
 * Replays locally queued actions against the API. Returns true when anything
 * was replayed so callers can refresh their data.
 */
export async function replayOfflineQueue(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  setAuthTokenFromStorage();
  let replayed = false;
  const actions = await getPendingActions();
  for (const action of actions) {
    try {
      await api.requestFromQueue(action);
      await removeAction(action.key);
      replayed = true;
    } catch (err) {
      console.warn("Queue replay failed", action.path, err);
    }
  }
  if (replayed) {
    setLastSyncAt();
    emitSync("saved");
    window.dispatchEvent(new CustomEvent("sync-refresh"));
  }
  return replayed;
}

export { api, setAuthToken, getAuthToken, pushAction };