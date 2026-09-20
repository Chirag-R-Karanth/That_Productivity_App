"use client";

import { useState, useEffect, useCallback } from "react";
import { api, getAuthToken, API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { clearPendingActions, getPendingActions } from "@/lib/offlineQueue";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/Reveal";

interface MeResponse {
  name: string;
  email: string;
  attendanceAutoMarkHours: number | null;
  pomodoroWorkMinutes: number | null;
  pomodoroBreakMinutes: number | null;
  chimeOnTheHour: boolean;
  googleCalendarLinked: boolean;
}

interface LinkedCalendar {
  id: string;
  summary: string;
  backgroundColor: string | null;
}

export default function SettingsPage() {
  const { logout } = useAuth();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [calendars, setCalendars] = useState<LinkedCalendar[]>([]);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [pomodoroWork, setPomodoroWork] = useState(25);
  const [pomodoroBreak, setPomodoroBreak] = useState(5);
  const [autoMarkHours, setAutoMarkHours] = useState<number | null>(null);
  const [chime, setChime] = useState(true);

  const justLinked = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("google") === "linked"
    : false;

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
      setAutoMarkHours(meRes.data.attendanceAutoMarkHours);
      setChime(meRes.data.chimeOnTheHour ?? true);
    }
    if ("ok" in calRes && calRes.ok) setCalendars(calRes.data);
    if ("ok" in statusRes && statusRes.ok) setGoogleConfigured(statusRes.data.configured);
    const pend = await getPendingActions().catch(() => []);
    setPendingCount(pend.length);
  }, []);

  useEffect(() => { void load(); }, [load]);

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
          <p className="mt-1 text-sm text-text-muted">{me?.email ?? "Loading…"}</p>
        </header>

        {justLinked && (
          <div className="rounded-xl border border-[#1a2e23] bg-[#14251c] px-4 py-3 text-sm text-[#5ce09e]">
            Google Calendar linked — run a sync below to pull your events.
          </div>
        )}
        {status && <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text">{status}</div>}
        {error && <div className="rounded-xl border border-[#3a1e24] bg-[#2a1418] px-4 py-3 text-sm text-[#f0a6a6]">{error}</div>}

        {/* Profile */}
        <Reveal delay={0}>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">Profile</h2>
            <div className="grid max-w-md gap-3">
              <label className="text-xs text-text-muted">
                Name
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
              </label>
              <div className="text-xs text-text-muted">
                Email
                <div className="mt-1 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text">{me?.email}</div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => void saveProfile()} disabled={saving}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
                {saving ? "…" : "Save profile"}
              </button>
            </div>
          </section>
        </Reveal>

        {/* Preferences */}
        <Reveal delay={50}>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">Preferences</h2>
            <div className="grid max-w-md gap-4 sm:grid-cols-3">
              <label className="text-xs text-text-muted">
                Pomodoro work (min)
                <input type="number" min={1} max={120} value={pomodoroWork} onChange={(e) => setPomodoroWork(+e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent" />
              </label>
              <label className="text-xs text-text-muted">
                Pomodoro break (min)
                <input type="number" min={1} max={60} value={pomodoroBreak} onChange={(e) => setPomodoroBreak(+e.target.value)}
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

        {/* Google Calendar */}
        <Reveal delay={100}>
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

        {/* This device */}
        <Reveal delay={150}>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-text-muted">This device</h2>
            <ul className="space-y-1 text-sm text-text-muted">
              <li>
                <span className="font-medium text-text">Use it on your phone:</span> open this page on your phone and
                choose “Add to Home Screen” in the browser menu — it installs as a full-screen app and works offline.
              </li>
              <li>
                <span className="font-medium text-text">Pending offline changes:</span> {pendingCount} write{pendingCount !== 1 ? "s" : ""} waiting to sync.
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => void clearLocal()}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-[#333a48] hover:text-text">
                Clear cached offline changes
              </button>
            </div>
          </section>
        </Reveal>

        {/* Sign out */}
        <Reveal delay={200}>
          <section className="rounded-2xl border border-border p-5">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-text-muted">Account</h2>
            <button onClick={() => void signOut()}
              className="rounded-lg bg-[#3a1e24] px-4 py-2 text-sm font-medium text-[#f0a6a6] transition-colors hover:bg-[#4a2e34]">
              Sign out
            </button>
          </section>
        </Reveal>
      </div>
    </AppShell>
  );
}