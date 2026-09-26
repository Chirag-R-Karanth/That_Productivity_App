"use client";

import { useEffect, useState } from "react";
import { getPendingActions } from "@/lib/offlineQueue";
import { setLastSyncAt } from "@/lib/syncStatus";
import { SYNC_QUEUE_EVENT, useLastSyncAt, type SyncPhase } from "@/lib/syncStatus";

export type SyncStatusKind = "saved" | "pending" | "saving" | "issue" | "offline";

/**
 * Live view of the device ↔ server sync state.
 *
 * Combines the browser online flag, the IndexedDB offline queue, and the
 * events emitted by api.ts / the SW replay loop into a single status:
 * saved / pending / saving / issue / offline.
 */
export function useSyncStatus() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [pending, setPending] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lastIssue, setLastIssue] = useState(false);
  const lastSyncAt = useLastSyncAt();

  useEffect(() => {
    let mounted = true;
    const refreshPending = async () => {
      const actions = await getPendingActions().catch(() => []);
      if (mounted) setPending(actions.length);
    };
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { phase?: SyncPhase } | undefined;
      const phase = detail?.phase;
      if (phase === "saving") {
        setSaving(true);
        return;
      }
      setSaving(false);
      setLastIssue(phase === "issue");
      if (phase === "saved") setLastSyncAt();
      void refreshPending();
    };
    const onOnline = () => {
      setOnline(true);
      void refreshPending();
    };
    const onOffline = () => setOnline(false);
    const onRefresh = () => void refreshPending();

    window.addEventListener(SYNC_QUEUE_EVENT, onEvent);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("sync-refresh", onRefresh);
    void refreshPending();
    return () => {
      mounted = false;
      window.removeEventListener(SYNC_QUEUE_EVENT, onEvent);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("sync-refresh", onRefresh);
    };
  }, []);

  const status: SyncStatusKind = !online
    ? "offline"
    : saving
      ? "saving"
      : pending > 0
        ? "pending"
        : lastIssue
          ? "issue"
          : "saved";

  return { status, pending, lastSyncAt, online };
}