"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getPendingActions } from "@/lib/offlineQueue";
import { getLastSyncAt, setLastSyncAt } from "@/lib/syncStatus";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/Reveal";

interface Health {
  serverTime: string;
  counts: {
    tasks: number;
    courses: number;
    attendanceRecords: number;
    calendarEvents: number;
    pomodoroSessions: number;
    events: number;
  };
  pendingSync: { pending: number; applied: number; failed: number };
}

interface BackupMeta {
  name: string;
  size: number;
  modifiedAt: string;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedBackupName(name: string) {
  return /^[A-Za-z0-9._-]+\.snapshot\.json$/.test(name);
}

export default function DataSyncPage() {
  const sync = useSyncStatus();
  const [health, setHealth] = useState<Health | null>(null);
  const [localPending, setLocalPending] = useState(0);
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [lastSyncAt, setLastSyncAtState] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [healthRes, pend] = await Promise.all([
      api.get<Health>("/api/sync").catch(() => null),
      getPendingActions().catch(() => []),
    ]);
    if (healthRes && "ok" in healthRes && healthRes.ok) setHealth(healthRes.data);
    setLocalPending(pend.length);
    setLastSyncAtState(getLastSyncAt());
    const backupsRes = await api.get<BackupMeta[]>("/api/sync/backups").catch(() => null);
    if (backupsRes && "ok" in backupsRes && backupsRes.ok) setBackups(backupsRes.data);
  }, []);

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("sync-refresh", onRefresh);
    return () => window.removeEventListener("sync-refresh", onRefresh);
  }, [load]);

  const flash = (text: string, kind: "ok" | "err" = "ok") => {
    setMessage({ kind, text });
    window.setTimeout(() => setMessage(null), 6000);
  };

  const exportData = async () => {
    setBusy("export");
    try {
      const res = await api.get<Record<string, unknown>>("/api/sync/export");
      if (!("ok" in res) || !res.ok) {
        flash("Export failed.", "err");
        return;
      }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `that-productivity-app-export-${new Date().toISOString().replace(/[:.]/g, "-")}.snapshot.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash("Exported — this JSON file is a full, restorable backup.");
      setLastSyncAt(new Date().toISOString());
    } catch (e) {
      flash(`Export failed: ${e instanceof Error ? e.message : "unknown error"}`, "err");
    } finally {
      setBusy(null);
    }
  };

  const createBackup = async () => {
    setBusy("backup");
    try {
      const res = await api.post<{ file: string }>("/api/sync/backup", {});
      if ("ok" in res && res.ok) {
        flash(`Backup created on the server: ${res.data.file}`);
        setLastSyncAt(new Date().toISOString());
        void load();
      } else {
        flash("Backup failed.", "err");
      }
    } catch (e) {
      flash(`Backup failed: ${e instanceof Error ? e.message : "unknown error"}`, "err");
    } finally {
      setBusy(null);
    }
  };

  const downloadBackup = (name: string) => {
    if (!isAllowedBackupName(name)) return;
    const auth = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const url = `/api/sync/backup/file?name=${encodeURIComponent(name)}`;
    fetch(url, { headers: auth ? { Authorization: `Bearer ${auth}` } : {} })
      .then((r) => {
        if (!r.ok) throw new Error(`Download failed (${r.status})`);
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => flash("Couldn't download that backup.", "err"));
  };

  const restore = async (file: File) => {
    setBusy("restore");
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        flash("That file isn't valid JSON.", "err");
        return;
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as Record<string, unknown>).app !== "that-productivity-app"
      ) {
        flash("That file isn't a That Productivity App backup.", "err");
        return;
      }
      const res = await api.post<{
        preRestoreBackup: string;
        restoredAt: string;
        counts: Record<string, number>;
      }>("/api/sync/restore", parsed);
      if ("ok" in res && res.ok) {
        const countsText = Object.entries(res.data.counts)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${k}×${n}`)
          .join(", ");
        flash(
          `Restore complete${countsText ? ` (${countsText})` : ""}. A pre-restore backup was saved as ${res.data.preRestoreBackup}.`,
        );
        setLastSyncAt(new Date().toISOString());
        void load();
      } else {
        flash("Restore was rejected.", "err");
      }
    } catch (e) {
      flash(`Restore failed: ${e instanceof Error ? e.message : "unknown error"}`, "err");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onFilePicked = (file: File | null) => {
    if (!file) return;
    if (!confirm("Restores replace this device's data with the file contents. A safe copy of the current data is taken first. Continue?")) return;
    void restore(file);
  };

  const statusText =
    sync.status === "offline"
      ? "Offline — changes are queued until you're back online."
      : sync.status === "pending"
        ? `${localPending} local change${localPending !== 1 ? "s" : ""} waiting to sync.`
        : sync.status === "saving"
          ? "Saving…"
          : sync.status === "issue"
            ? "Some changes couldn't sync — see your last backup and the conflicts note below."
            : "All changes saved.";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Data &amp; Sync</h1>
          <p className="mt-1 text-sm text-text-muted">
            Everything that lives on your device and on the server — and backups so none of it is ever lost.
          </p>
        </header>

        {message && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              message.kind === "ok"
                ? "border-[#1a2e23] bg-[#14251c] text-[#5ce09e]"
                : "border-[#3a1e24] bg-[#2a1418] text-[#f0a6a6]"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Local health */}
        <Reveal delay={0}>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">This device</h2>
            <ul className="space-y-1.5 text-sm text-text-muted">
              <li>
                <span className="inline-block w-32 font-medium text-text">Status</span> {statusText}
              </li>
              <li>
                <span className="inline-block w-32 font-medium text-text">Last sync</span>{" "}
                {lastSyncAt ?? "never"}
              </li>
              <li>
                <span className="inline-block w-32 font-medium text-text">Local queue</span>{" "}
                {localPending} queued write{localPending !== 1 ? "s" : ""}
                {sync.status === "pending" || sync.status === "offline" ? (
                  <span className="ml-2 text-[#e0c25c]">(will retry when online)</span>
                ) : null}
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => void exportData()}
                disabled={busy !== null}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {busy === "export" ? "Exporting…" : "Export all data (JSON)"}
              </button>
              <button
                onClick={() => void createBackup()}
                disabled={busy !== null}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text disabled:opacity-50"
              >
                {busy === "backup" ? "Creating…" : "Create backup"}
              </button>
            </div>
            <label className="mt-3 inline-block">
              <span className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text">
                Restore from a file…
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.snapshot,.snapshot.json"
                className="sr-only"
                onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
              />
            </label>
          </section>
        </Reveal>

        {/* Server health */}
        <Reveal delay={50}>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">Server health</h2>
            {health ? (
              <>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-text-muted sm:grid-cols-3">
                  <div>Tasks: <span className="font-medium text-text">{health.counts.tasks}</span></div>
                  <div>Courses: <span className="font-medium text-text">{health.counts.courses}</span></div>
                  <div>Attendance records: <span className="font-medium text-text">{health.counts.attendanceRecords}</span></div>
                  <div>Calendar events: <span className="font-medium text-text">{health.counts.calendarEvents}</span></div>
                  <div>Focus sessions: <span className="font-medium text-text">{health.counts.pomodoroSessions}</span></div>
                  <div>Events logged: <span className="font-medium text-text">{health.counts.events}</span></div>
                </div>
                <div className="mt-3 text-xs text-text-muted">
                  Server time: {health.serverTime.replace("T", " ").replace("Z", " UTC")}
                </div>
              </>
            ) : (
              <p className="text-sm text-text-muted">Loading…</p>
            )}
          </section>
        </Reveal>

        {/* Backups */}
        <Reveal delay={100}>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wider text-text-muted">Server snapshots</h2>
            <p className="mb-4 text-xs text-text-muted">
              Created on the server via “Create backup”, or automatically before every restore. Download one to keep
              an extra copy, or restore a file you downloaded above.
            </p>
            {backups.length === 0 ? (
              <p className="text-sm text-text-muted">No server snapshots yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {backups.map((b) => (
                  <li
                    key={b.name}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface-elevated px-3 py-2 text-sm"
                  >
                    <button
                      onClick={() => downloadBackup(b.name)}
                      className="min-w-0 truncate text-left text-text transition-colors hover:text-accent"
                      title={b.name}
                    >
                      {b.name}
                    </button>
                    <span className="shrink-0 text-xs text-text-muted">
                      {fmtSize(b.size)} · {new Date(b.modifiedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Reveal>

        {/* Conflicts */}
        <Reveal delay={150}>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wider text-text-muted">
              PendingSync &amp; conflicts
            </h2>
            <p className="text-xs text-text-muted">
              Every write is tagged with an idempotency key so replays never double-apply. Native edits resolve
              last-write-wins; Google data keeps its source IDs and is never written back. Genuine failures land here.
            </p>
            {health && (
              <p className="mt-3 text-sm">
                <span className="text-text-muted">
                  Pending: <span className="font-medium text-[#e0c25c]">{health.pendingSync.pending}</span>
                </span>
                <span className="ml-4 text-text-muted">
                  Applied: <span className="font-medium text-[#5ce09e]">{health.pendingSync.applied}</span>
                </span>
                <span className="ml-4 text-text-muted">
                  Failed: <span className="font-medium text-[#f0a6a6]">{health.pendingSync.failed}</span>
                </span>
              </p>
            )}
          </section>
        </Reveal>
      </div>
    </AppShell>
  );
}