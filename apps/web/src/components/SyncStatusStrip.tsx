"use client";

import Link from "next/link";
import { useSyncStatus } from "@/hooks/useSyncStatus";

const CONFIG: Record<
  string,
  { dot: string; bg: string; text: string; label: string }
> = {
  saved: { dot: "bg-[#5ce09e]", bg: "bg-[#14251c]", text: "text-[#5ce09e]", label: "All changes saved" },
  pending: { dot: "bg-[#e0c25c] animate-pulse", bg: "bg-[#251f14]", text: "text-[#e0c25c]", label: "Pending changes waiting to sync" },
  saving: { dot: "bg-[#8fb0ff] animate-pulse", bg: "bg-[#142030]", text: "text-[#8fb0ff]", label: "Saving…" },
  issue: { dot: "bg-[#f0a6a6]", bg: "bg-[#2a1418]", text: "text-[#f0a6a6]", label: "Some changes couldn't sync" },
  offline: { dot: "bg-[#f0a6a6]", bg: "bg-[#2a1418]", text: "text-[#f0a6a6]", label: "Offline — changes will sync when you're back" },
};

/**
 * Slim, always-visible bar reflecting the device ↔ server sync state. It
 * reads live state from useSyncStatus (IndexedDB queue + SW events + api.ts)
 * and links to the Data & Sync page for details.
 */
export function SyncStatusStrip() {
  const { status, pending, lastSyncAt } = useSyncStatus();
  const cfg = CONFIG[status];

  const lastSyncText = lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  }) : null;

  const detail =
    status === "pending" || status === "offline"
      ? ` · ${pending} queued`
      : status === "saved" && lastSyncText
        ? ` · ${lastSyncText}`
        : "";

  return (
    <Link
      href="/data-sync"
      className={`fixed bottom-14 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border px-4 py-1.5 text-xs font-medium shadow-lg transition-colors md:bottom-5 ${cfg.bg} ${cfg.text}`}
    >
      <span className="inline-flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${cfg.dot}`} />
        <span>
          {cfg.label}
          {detail}
        </span>
      </span>
    </Link>
  );
}