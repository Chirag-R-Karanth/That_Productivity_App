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

/**
 * A Google calendar belonging to one linked account. The id is only unique
 * within that account, so every calendar action is addressed by the pair
 * (connectionId, id) rather than the id alone.
 */
interface LinkedCalendar {
  id: string;
  summary: string;
  backgroundColor: string | null;
  /** Whether this calendar's events count as planned time in the day model. */
  includeInDay: boolean;
  connectionId: string;
  accountEmail: string | null;
  accountName: string | null;
}

/** One linked Google account. */
interface GoogleConnection {
  id: string;
  email: string;
  displayName: string | null;
  needsRelink: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  calendarCount: number;
  createdAt: string;
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
  const [connections, setConnections] = useState<GoogleConnection[]>([]);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [taskSyncResult, setTaskSyncResult] = useState<string | null>(null);
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
    const [meRes, calRes, statusRes, connRes] = await Promise.all([
      api.get<MeResponse>("/api/auth/me"),
      api.get<LinkedCalendar[]>("/api/calendar/google/calendars"),
      api.get<{ configured: boolean }>("/api/auth/google/status"),
      api.get<GoogleConnection[]>("/api/auth/google/connections"),
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
    if ("ok" in connRes && connRes.ok) setConnections(connRes.data);
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
    // Resolved against the current origin so the destination is always absolute:
    // API_BASE is empty in the same-origin Docker deployment and a full URL when
    // the API is hosted separately, and `location.assign` wants one or the other,
    // not an ambiguous "/api/..." string.
    const token = getAuthToken() ?? "";
    const url = new URL(`${API_BASE}/api/auth/google`, window.location.origin);
    url.searchParams.set("token", token);
    window.location.assign(url.toString());
  };

  // Addressed by (connectionId, id): every linked account has a `primary`
  // calendar, so the id on its own does not identify one.
  const calendarKey = (c: { connectionId: string; id: string }) => `${c.connectionId}:${c.id}`;

  const setCalendarIncluded = async (cal: LinkedCalendar, includeInDay: boolean) => {
    // Applied optimistically: the checkbox is the feedback, and the day model is
    // rebuilt on the next fetch either way.
    const key = calendarKey(cal);
    setCalendars((prev) => prev.map((c) => (calendarKey(c) === key ? { ...c, includeInDay } : c)));
    const res = await api.patch<LinkedCalendar>(
      `/api/calendar/google/connections/${cal.connectionId}/calendars/${cal.id}`,
      { includeInDay },
    );
    if (!("ok" in res && res.ok)) {
      setCalendars((prev) =>
        prev.map((c) => (calendarKey(c) === key ? { ...c, includeInDay: !includeInDay } : c)),
      );
    }
  };

  const unlinkCalendar = async (cal: LinkedCalendar) => {
    if (!confirm(`Stop syncing "${cal.summary}"?`)) return;
    await api.delete(`/api/calendar/google/connections/${cal.connectionId}/calendars/${cal.id}`);
    setCalendars((prev) => prev.filter((c) => calendarKey(c) !== calendarKey(cal)));
    setStatus("Calendar unlinked.");
  };

  const syncNow = async () => {
    setSaving(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await api.post<{
        eventsAdded: number;
        eventsUpdated: number;
        eventsDeleted: number;
        mergedDuplicates: number;
        accountsSynced: number;
        accountsFailed: number;
        failures: { connectionId: string; error: string }[];
      }>(
        "/api/calendar/google/sync",
        {},
      );
      if ("ok" in res && res.ok && !("queued" in (res.data as object))) {
        setSyncResult(
          `Synced ${res.data.accountsSynced} account(s): +${res.data.eventsAdded} new, ` +
            `${res.data.eventsUpdated} updated, ${res.data.eventsDeleted} removed, ` +
            `${res.data.mergedDuplicates} duplicates merged.`,
        );
        // A failed account is reported by name, so "synced, nothing found" is
        // never mistaken for a working but empty calendar.
        if (res.data.accountsFailed > 0) {
          const names = res.data.failures
            .map((f) => connections.find((c) => c.id === f.connectionId)?.email ?? f.connectionId)
            .join(", ");
          setError(`${res.data.accountsFailed} account(s) couldn't be synced: ${names}.`);
        }
      } else {
        setError("The sync was queued — it will run once you're back online.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed — is your Google account still linked?");
    } finally {
      setSaving(false);
    }
  };

  const disconnectAccount = async (conn: GoogleConnection) => {
    if (
      !confirm(
        `Disconnect ${conn.email}? Its calendars and tasks are removed from this app. ` +
          `Any other linked Google account is left alone.`,
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.delete(`/api/auth/google/connections/${conn.id}`);
      if (!("ok" in res && res.ok)) {
        setError("Couldn't disconnect that account.");
        return;
      }
      await load();
      setStatus(`Disconnected ${conn.email}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't disconnect that account.");
    } finally {
      setSaving(false);
    }
  };

  const syncTasks = async () => {
    setSaving(true);
    setError(null);
    setTaskSyncResult(null);
    try {
      const res = await api.post<{
        tasksPulled: number;
        tasksCompletedRemotely: number;
        accountsSynced: number;
        accountsFailed: number;
        failures: { connectionId: string; error: string }[];
      }>("/api/tasks/google/sync", {});
      if ("ok" in res && res.ok && !("queued" in (res.data as object))) {
        setTaskSyncResult(
          `Tasks synced from ${res.data.accountsSynced} account(s): ` +
            `${res.data.tasksPulled} new, ${res.data.tasksCompletedRemotely} completed in Google.`,
        );
        if (res.data.accountsFailed > 0) {
          const names = res.data.failures
            .map((f) => connections.find((c) => c.id === f.connectionId)?.email ?? f.connectionId)
            .join(", ");
          setError(`${res.data.accountsFailed} account(s) couldn't be read: ${names}.`);
        }
        await load();
      } else {
        setError("The task sync was queued — it will run once you're back online.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Task sync failed.");
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
                Link every Google account you use. Their calendars and task lists all feed the same
                Calendar and Tasks views, and a meeting that more than one account received is shown
                once. Calendar events are read-only; tasks sync both ways.
              </p>

              {!googleConfigured && (
                <div className="rounded-xl border border-[#2a2438] bg-[#221d30] px-4 py-3 text-sm text-[#b3a6ff]">
                  Google Calendar isn&apos;t configured on this server yet. Set <code className="text-xs">GOOGLE_CLIENT_ID</code>,
                  <code className="text-xs">GOOGLE_CLIENT_SECRET</code> and <code className="text-xs">GOOGLE_REDIRECT_URI</code> in{" "}
                  <code className="text-xs">.env</code>, then restart the backend.
                </div>
              )}

              {googleConfigured && connections.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  <p className="px-1 pb-1 text-xs text-text-muted">
                    {connections.length === 1
                      ? "Your Google account. Link another to bring in a second calendar and task list."
                      : `${connections.length} Google accounts linked. All of them feed the same Calendar and Tasks.`}
                  </p>
                  {connections.map((conn) => (
                    <div
                      key={conn.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-surface-elevated px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            conn.needsRelink ? "bg-[#ffb454]" : "bg-[#5ce09e]"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm text-text">
                            {conn.displayName ?? conn.email}
                          </p>
                          <p className="truncate text-[11px] text-text-muted">
                            {conn.email}
                            {conn.needsRelink
                              ? " \u00b7 needs reconnecting"
                              : conn.lastSyncedAt
                                ? ` \u00b7 synced ${new Date(conn.lastSyncedAt).toLocaleString()}`
                                : " \u00b7 not synced yet"}
                          </p>
                          {conn.needsRelink && conn.lastError && (
                            <p className="mt-0.5 text-[11px] text-[#ffb454]">{conn.lastError}</p>
                          )}
                        </div>
                      </div>
                      {conn.needsRelink && (
                        <button onClick={connectGoogle}
                          className="shrink-0 rounded px-2 py-1 text-xs text-[#ffb454] transition-colors hover:bg-surface">
                          Reconnect
                        </button>
                      )}
                      <button
                        onClick={() => void disconnectAccount(conn)}
                        disabled={saving}
                        className="shrink-0 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface hover:text-danger disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {calendars.length > 0 && (
                <div className="mb-4 space-y-3">
                  <p className="px-1 pb-1 text-xs text-text-muted">
                    A calendar can stay linked and keep syncing without counting
                    as planned time, if it is not really your day. A meeting that
                    several of your accounts both received is shown once.
                  </p>
                  {/* Grouped by account: the same calendar name can appear under
                      more than one linked account, and unlinking one must not
                      look like it removed the other. */}
                  {connections.map((conn) => {
                    const own = calendars.filter((c) => c.connectionId === conn.id);
                    if (own.length === 0) return null;
                    return (
                      <div key={conn.id} className="space-y-1.5">
                        <p className="px-1 text-[11px] uppercase tracking-wider text-text-muted">
                          {conn.displayName ?? conn.email}
                        </p>
                        {own.map((c) => (
                          <div
                            key={calendarKey(c)}
                            className="flex items-center justify-between gap-3 rounded-lg bg-surface-elevated px-3 py-2"
                          >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-text">
                              <input
                                type="checkbox"
                                checked={c.includeInDay}
                                onChange={(e) => void setCalendarIncluded(c, e.target.checked)}
                                className="h-3.5 w-3.5 shrink-0 accent-accent"
                              />
                              <span className="truncate">{c.summary}</span>
                            </label>
                            <span className="shrink-0 text-[11px] text-text-muted">
                              {c.includeInDay ? "counts" : "ignored"}
                            </span>
                            <button onClick={() => void unlinkCalendar(c)}
                              className="shrink-0 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface hover:text-danger">
                              Unlink
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {googleConfigured && connections.length > 0 && (
                  <button onClick={() => void syncNow()} disabled={saving}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
                    {saving ? "Syncing…" : "Sync all accounts"}
                  </button>
                )}
                {googleConfigured && (
                  <button onClick={connectGoogle}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
                    {connections.length === 0
                      ? "Connect Google Calendar"
                      : "Link another Google account"}
                  </button>
                )}
                {/* Tasks and calendars are synced separately: one can be failing
                    while the other is fine, and a combined button would hide
                    which. */}
                {googleConfigured && connections.length > 0 && (
                  <button onClick={() => void syncTasks()} disabled={saving}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text disabled:opacity-50">
                    {saving ? "Syncing…" : "Sync tasks"}
                  </button>
                )}
                <button onClick={() => void load()}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text">
                  Refresh
                </button>
              </div>

              {syncResult && <p className="mt-3 text-xs text-[#5ce09e]">{syncResult}</p>}
              {taskSyncResult && <p className="mt-1 text-xs text-[#5ce09e]">{taskSyncResult}</p>}
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