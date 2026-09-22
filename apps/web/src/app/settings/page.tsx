"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, getAuthToken, API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { clearPendingActions, getPendingActions } from "@/lib/offlineQueue";
import { getLastSyncAt } from "@/lib/syncStatus";
import { useTheme } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/Reveal";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import { CommandIcon } from "@/components/icons";

interface MeResponse {
  name: string;
  email: string;
  attendanceAutoMarkHours: number | null;
  pomodoroWorkMinutes: number | null;
  pomodoroBreakMinutes: number | null;
  pomodoroLongBreakMinutes: number | null;
  pomodoroSessionsPerCycle: number | null;
  chimeOnTheHour: boolean;
  googleCalendarLinked: boolean;
}

interface LinkedCalendar {
  id: string;
  summary: string;
  backgroundColor: string | null;
}

type Tab = "appearance" | "notifications" | "integrations" | "data-sync" | "keyboard";

const TABS: { id: Tab; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "integrations", label: "Integrations" },
  { id: "data-sync", label: "Data & Sync" },
  { id: "keyboard", label: "Keyboard" },
];

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["Ctrl K", "⌘ K"], action: "Open command palette" },
  { keys: ["N"], action: "New task" },
  { keys: ["T"], action: "Go to Tasks" },
  { keys: ["C"], action: "Go to Calendar" },
  { keys: ["A"], action: "Go to Attendance" },
  { keys: ["Z"], action: "Enter Zen mode" },
  { keys: ["Esc"], action: "Close dialog / palette" },
];

export default function SettingsPage() {
  const { logout } = useAuth();
  const { reduceMotion, setReduceMotion } = useTheme();
  const router = useRouter();

  // The active tab can be seeded via /settings?tab=data-sync (see keyboard
  // shortcuts and the command palette). Read it once client-side.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "appearance";
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    return TABS.some((x) => x.id === t) ? (t as Tab) : "appearance";
  });

  const [me, setMe] = useState<MeResponse | null>(null);
  const [calendars, setCalendars] = useState<LinkedCalendar[]>([]);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [pomodoroWork, setPomodoroWork] = useState(25);
  const [pomodoroBreak, setPomodoroBreak] = useState(5);
  const [pomodoroLongBreak, setPomodoroLongBreak] = useState(15);
  const [pomodoroSessionsPerCycle, setPomodoroSessionsPerCycle] = useState(4);
  const [autoMarkHours, setAutoMarkHours] = useState<number | null>(null);
  const [chime, setChime] = useState(true);

  const justLinked =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("google") === "linked";

  const load = useCallback(async () => {
    const [meRes, calRes, statusRes] = await Promise.all([
      api.get<MeResponse>("/api/auth/me"),
      api.get<LinkedCalendar[]>("/api/calendar/google/calendars"),
      api.get<{ configured: boolean }>("/api/auth/google/status"),
    ]);
    if ("ok" in meRes && meRes.ok) {
      setMe(meRes.data);
      setName(meRes.data.name ?? "");
      setPomodoroWork(meRes.data.pomodoroWorkMinutes ?? 25);
      setPomodoroBreak(meRes.data.pomodoroBreakMinutes ?? 5);
      setPomodoroLongBreak(meRes.data.pomodoroLongBreakMinutes ?? 15);
      setPomodoroSessionsPerCycle(meRes.data.pomodoroSessionsPerCycle ?? 4);
      setAutoMarkHours(meRes.data.attendanceAutoMarkHours);
      setChime(meRes.data.chimeOnTheHour ?? true);
    }
    if ("ok" in calRes && calRes.ok) setCalendars(calRes.data);
    if ("ok" in statusRes && statusRes.ok) setGoogleConfigured(statusRes.data.configured);
    const pend = await getPendingActions().catch(() => []);
    setPendingCount(pend.length);
    setLastSyncAt(getLastSyncAt());
  }, []);

  useEffect(() => { void load(); }, [load]);

  const changeTab = (t: Tab) => {
    setTab(t);
    router.replace(t === "appearance" ? "/settings" : `/settings?tab=${t}`, { scroll: false });
  };

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      const trimmed = name.trim();
      if (trimmed) body.name = trimmed;
      if (Object.keys(body).length === 0) { setStatus("Nothing to save."); return; }
      const res = await api.patch("/api/auth/me", body);
      if ("ok" in res && !res.ok) setError("Couldn't save the name.");
      else setStatus("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const savePrefs = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch("/api/auth/me", {
        pomodoroWorkMinutes: pomodoroWork,
        pomodoroBreakMinutes: pomodoroBreak,
        pomodoroLongBreakMinutes: pomodoroLongBreak,
        pomodoroSessionsPerCycle: pomodoroSessionsPerCycle,
        attendanceAutoMarkHours: autoMarkHours,
        chimeOnTheHour: chime,
      });
      if ("ok" in res && !res.ok) setError("Couldn't save preferences.");
      else setStatus("Preferences saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const connectGoogle = () => {
    const token = getAuthToken() ?? "";
    window.location.href = `${API_BASE}/api/auth/google?token=${encodeURIComponent(token)}`;
  };

  const unlinkCalendar = async (id: string) => {
    if (!confirm("Stop syncing this calendar?")) return;
    await api.delete(`/api/calendar/google/calendars/${id}`);
    setCalendars((prev) => prev.filter((c) => c.id !== id));
    setStatus("Calendar unlinked.");
  };

  const syncNow = async () => {
    setSaving(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await api.post<{ eventsAdded: number; eventsUpdated: number; eventsDeleted: number; mergedDuplicates: number }>(
        "/api/calendar/google/sync",
        {},
      );
      if ("ok" in res && res.ok && !("queued" in (res.data as object))) {
        setSyncResult(
          `Synced: +${res.data.eventsAdded} new, ${res.data.eventsUpdated} updated, ${res.data.eventsDeleted} removed, ${res.data.mergedDuplicates} duplicates merged.`,
        );
      } else {
        setError("The sync was queued — it will run once you're back online.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed — is your Google account still linked?");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await clearPendingActions();
    setStatus("Signed out.");
    logout();
  };

  const clearLocal = async () => {
    await clearPendingActions();
    setPendingCount(0);
    setStatus("Cleared pending offline changes from this device.");
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-text-muted">Appearance, notifications, and how your data stays in sync.</p>
        </header>

        {justLinked && (
          <div className="rounded-xl border border-[#1a2e23] bg-[#14251c] px-4 py-3 text-sm text-[#5ce09e]">
            Google Calendar linked — run a sync from Integrations to pull your events.
          </div>
        )}
        {status && <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text">{status}</div>}
        {error && <div className="rounded-xl border border-[#3a1e24] bg-[#2a1418] px-4 py-3 text-sm text-[#f0a6a6]">{error}</div>}

        {/* Account — always on top, outside the tabs */}
        <Reveal delay={0}>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-text">{me?.email ?? "Loading…"}</h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  {me?.name ? `Signed in as ${me.name}` : "Add a display name below."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => void signOut()}
                  className="rounded-lg bg-[#3a1e24] px-4 py-2 text-sm font-medium text-[#f0a6a6] transition-colors hover:bg-[#4a2e34]">
                  Sign out
                </button>
              </div>
            </div>
            <div className="mt-4 grid max-w-md gap-3">
              <label className="text-xs text-text-muted">
                Display name
                <div className="mt-1 flex gap-2">
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                  <button onClick={() => void saveProfile()} disabled={saving}
                    className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
                    {saving ? "…" : "Save"}
                  </button>
                </div>
              </label>
            </div>
          </section>
        </Reveal>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => changeTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                tab === t.id ? "bg-surface-elevated font-medium text-text" : "text-text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "appearance" && (
          <Reveal delay={40}>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">Theme</h2>
              <p className="mb-3 text-xs text-text-muted">Pick a light or dark look. It applies everywhere in the app.</p>
              <ThemeToggle />
              <h2 className="mb-3 mt-6 text-sm font-medium uppercase tracking-wider text-text-muted">Motion</h2>
              <label className="flex items-center gap-2 text-sm text-text">
                <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} className="accent-accent" />
                Reduce animations
              </label>
              <p className="mt-1 text-xs text-text-muted">Also follows your system preference automatically.</p>
            </section>
          </Reveal>
        )}

        {tab === "notifications" && (
          <Reveal delay={40}>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-1 text-sm font-medium uppercase tracking-wider text-text-muted">Focus &amp; reminders</h2>
              <p className="mb-4 text-xs text-text-muted">
                In-app activity shows in the bell icon. Push/email notifications arrive once
                integrations ship.
              </p>
              <div className="grid max-w-lg gap-4 sm:grid-cols-3">
                <label className="text-xs text-text-muted">
                  Pomodoro work (min)
                  <input type="number" min={1} max={120} value={pomodoroWork} onChange={(e) => setPomodoroWork(+e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                </label>
                <label className="text-xs text-text-muted">
                  Short break (min)
                  <input type="number" min={1} max={60} value={pomodoroBreak} onChange={(e) => setPomodoroBreak(+e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                </label>
                <label className="text-xs text-text-muted">
                  Long break (min)
                  <input type="number" min={5} max={120} value={pomodoroLongBreak} onChange={(e) => setPomodoroLongBreak(+e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                </label>
                <label className="text-xs text-text-muted">
                  Focus sessions / cycle
                  <input type="number" min={2} max={12} value={pomodoroSessionsPerCycle} onChange={(e) => setPomodoroSessionsPerCycle(+e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                </label>
                <label className="text-xs text-text-muted">
                  Auto-mark attendance (hrs)
                  <input type="number" min={0} value={autoMarkHours ?? ""} placeholder="Never"
                    onChange={(e) => setAutoMarkHours(e.target.value === "" ? null : +e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                </label>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-text">
                <input type="checkbox" checked={chime} onChange={(e) => setChime(e.target.checked)} className="accent-accent" />
                Chime on the hour
              </label>
              <div className="mt-4 flex justify-end">
                <button onClick={() => void savePrefs()} disabled={saving}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
                  {saving ? "…" : "Save preferences"}
                </button>
              </div>
            </section>
          </Reveal>
        )}

        {tab === "integrations" && (
          <Reveal delay={40}>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-1 text-sm font-medium uppercase tracking-wider text-text-muted">Google Calendar</h2>
              <p className="mb-4 text-xs text-text-muted">
                Connect your Google account so all your calendars show up in the unified Calendar view (events are
                read-only — nothing is written back).
              </p>

              {!googleConfigured && (
                <div className="rounded-xl border border-[#2a2438] bg-[#221d30] px-4 py-3 text-sm text-[#b3a6ff]">
                  Google Calendar isn&apos;t configured on this server yet. Set <code className="text-xs">GOOGLE_CLIENT_ID</code>,
                  <code className="text-xs">GOOGLE_CLIENT_SECRET</code> and <code className="text-xs">GOOGLE_REDIRECT_URI</code> in{" "}
                  <code className="text-xs">.env</code>, then restart the backend.
                </div>
              )}

              {googleConfigured && me?.googleCalendarLinked && (
                <div className="mb-4 flex items-center gap-2">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#5ce09e]" />
                  <span className="text-sm text-text-muted">Connected. Your calendars are synced from Google.</span>
                </div>
              )}

              {calendars.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  {calendars.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg bg-surface-elevated px-3 py-2">
                      <span className="flex items-center gap-2 text-sm text-text">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.backgroundColor ?? "#8fb0ff" }} />
                        {c.summary}
                      </span>
                      <button onClick={() => void unlinkCalendar(c.id)}
                        className="rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface hover:text-danger">
                        Unlink
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {googleConfigured && (
                  me?.googleCalendarLinked ? (
                    <button onClick={() => void syncNow()} disabled={saving}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
                      {saving ? "Syncing…" : "Sync now"}
                    </button>
                  ) : (
                    <button onClick={connectGoogle}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
                      Connect Google Calendar
                    </button>
                  )
                )}
                <button onClick={() => void load()}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text">
                  Refresh
                </button>
              </div>

              {syncResult && <p className="mt-3 text-xs text-[#5ce09e]">{syncResult}</p>}
            </section>
          </Reveal>
        )}

        {tab === "data-sync" && (
          <Reveal delay={40}>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-text-muted">Data &amp; Sync</h2>
              <ul className="space-y-1 text-sm text-text-muted">
                <li>
                  <span className="font-medium text-text">Pending offline changes:</span> {pendingCount} write{pendingCount !== 1 ? "s" : ""} waiting to sync.
                </li>
                <li>
                  <span className="font-medium text-text">Last sync:</span> {lastSyncAt ?? "never"}
                </li>
                <li>
                  <span className="font-medium text-text">Backups:</span> export everything as a JSON file, create
                  server snapshots, and restore from a file whenever you need to.
                </li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/data-sync"
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  Open Data &amp; Sync
                </Link>
                <button onClick={() => void clearLocal()}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text">
                  Clear cached offline changes
                </button>
              </div>
            </section>
          </Reveal>
        )}

        {tab === "keyboard" && (
          <Reveal delay={40}>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
                <CommandIcon className="h-4 w-4" /> Keyboard shortcuts
              </h2>
              <p className="mb-4 mt-1 text-xs text-text-muted">
                Shortcuts are ignored while you&apos;re typing. Press{" "}
                <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px]">Ctrl K</kbd> any time.
              </p>
              <div className="max-w-md">
                {SHORTCUTS.map((s) => (
                  <div key={s.action} className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0">
                    <span className="text-sm text-text">{s.action}</span>
                    <span className="flex gap-1">
                      {s.keys.map((k) => (
                        <kbd key={k} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-muted">{k}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </Reveal>
        )}
      </div>
    </AppShell>
  );
}