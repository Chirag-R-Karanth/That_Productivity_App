"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type { CourseAttendanceSummary, TodayClass, AttendanceRecordWithCourse, AttendanceStatus } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/Reveal";

const STATUS_STYLES: Record<AttendanceStatus, { bg: string; text: string; label: string }> = {
  ATTENDED: { bg: "bg-[#1a2e23]", text: "text-[#5ce09e]", label: "✓ Attended" },
  MISSED: { bg: "bg-[#3a1e24]", text: "text-[#f0a6a6]", label: "✕ Missed" },
  CANCELLED: { bg: "bg-surface-elevated", text: "text-text-muted", label: "— Cancelled" },
  UNCONFIRMED: { bg: "bg-[#2a2438]", text: "text-[#b3a6ff]", label: "? Unconfirmed" },
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * `useSearchParams` opts a route out of static prerendering unless it sits
 * behind a Suspense boundary, so the reading of it is confined to this child
 * and the shell around it can still be prerendered.
 */
export default function AttendancePage() {
  return (
    <Suspense fallback={<AttendanceShell />}>
      <AttendanceView />
    </Suspense>
  );
}

function AttendanceShell({ children }: { children?: React.ReactNode }) {
  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="mt-1 text-sm text-text-muted">Loading…</p>
        </header>
        {children}
      </div>
    </AppShell>
  );
}

function AttendanceView() {
  const [summaries, setSummaries] = useState<CourseAttendanceSummary[]>([]);
  const [today, setToday] = useState<TodayClass[]>([]);
  const [history, setHistory] = useState<{ date: string; records: AttendanceRecordWithCourse[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const gaugeRef = useRef<HTMLDivElement>(null);
  const search = useSearchParams();
  const deepLink = search.get("record");

  const load = useCallback(async () => {
    const [s, t, h] = await Promise.all([
      api.get<CourseAttendanceSummary[]>("/api/courses/summaries"),
      api.get<TodayClass[]>("/api/attendance/today"),
      api.get<{ date: string; records: AttendanceRecordWithCourse[] }[]>("/api/attendance"),
    ]);
    if ("ok" in s && s.ok) setSummaries(s.data);
    if ("ok" in t && t.ok) setToday(t.data);
    if ("ok" in h && h.ok) setHistory(h.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  /**
   * A push notification or bell row links straight at the record it is about,
   * which is frequently not one of today's classes — a prompt can outlive the
   * class it came from. Landing on the Today tab with nothing highlighted would
   * tell the user to go and look for something, which is the opposite of what
   * they clicked for, so the link decides the tab until they pick another one.
   */
  const deepLinked = Boolean(
    deepLink && history.some((d) => d.records.some((r) => r.id === deepLink)),
  );
  const [chosenTab, setChosenTab] = useState<"today" | "history" | null>(null);
  const tab = chosenTab ?? (deepLinked ? "history" : "today");
  const focused = deepLinked ? deepLink : null;

  useEffect(() => {
    if (!deepLinked || !deepLink) return;
    // Wait for the History tab to paint before scrolling to the row in it.
    const raf = requestAnimationFrame(() => {
      document
        .querySelector(`[data-record-id="${deepLink}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [deepLinked, deepLink, history]);

  const resolveRecord = async (recordId: string, status: Exclude<AttendanceStatus, "UNCONFIRMED">) => {
    const res = await api.patch<{ ok?: boolean }>(`/api/attendance/${recordId}/resolve`, { status });
    if ("ok" in res && res.ok) {
      setToday((prev) =>
        prev.map((c) =>
          c.attendanceRecord?.id === recordId
            ? { ...c, attendanceRecord: { ...c.attendanceRecord, status, confirmedAt: new Date().toISOString() } }
            : c,
        ),
      );
      // History is where a record answered from a notification usually is, so
      // it has to be updated in place — otherwise the badge the user just
      // cleared reappears on the next fetch.
      setHistory((prev) =>
        prev.map((d) => ({
          ...d,
          records: d.records.map((r) =>
            r.id === recordId
              ? { ...r, status, confirmedAt: new Date().toISOString() }
              : r,
          ),
        })),
      );
      // Refresh summaries
      const s = await api.get<CourseAttendanceSummary[]>("/api/courses/summaries");
      if ("ok" in s && s.ok) setSummaries(s.data);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="mt-1 text-sm text-text-muted">
            {loading ? "Loading…" : `${summaries.length} course${summaries.length !== 1 ? "s" : ""} tracked`}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
            {(["today", "history"] as const).map((t) => (
              <button key={t} onClick={() => setChosenTab(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t ? "bg-surface-elevated text-text" : "text-text-muted hover:text-text"
              }`}>
              {t === "today" ? "Today" : "History"}
            </button>
          ))}
        </div>
      </header>

      {/* Attendance summaries */}
      {summaries.length > 0 && (
        <Reveal delay={0}>
          <div ref={gaugeRef} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((s) => (
            <div key={s.course.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-text">{s.course.name}</h3>
                  {s.course.code && <span className="text-[10px] text-text-muted">{s.course.code}</span>}
                </div>
                {s.atRisk && (
                  <span className="rounded bg-[#3a1e24] px-1.5 py-0.5 text-[10px] font-medium text-[#f0a6a6]">AT RISK</span>
                )}
              </div>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-3xl font-bold tabular-nums">
                  {s.percentage !== null ? <AnimatedNumber value={s.percentage} format={(v) => `${v}`} /> : "—"}
                </span>
                <span className="mb-1 text-sm text-text-muted">%</span>
              </div>
              <p className="mt-1 text-[11px] text-text-muted">
                Threshold: {s.requiredThreshold}% · {s.attended}A/{s.missed}M
                {s.unconfirmed > 0 && ` / ${s.unconfirmed} pending`}
              </p>
            </div>
          ))}
          </div>
        </Reveal>
      )}

      {/* Today's classes */}
      {tab === "today" && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-text-muted">Today&apos;s classes</h2>
          {today.length === 0 && !loading && (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <p className="text-[14px] font-medium text-text">Nothing scheduled today.</p>
              <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-text-muted">
                No classes on the timetable for today, so there is no attendance to
                confirm. Tomorrow&apos;s classes appear here once the day starts.
              </p>
            </div>
          )}
          {today.map((tc) => {
            const status = tc.attendanceRecord?.status ?? "UNCONFIRMED";
            const style = STATUS_STYLES[status];
            return (
              <div key={tc.course.id} className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
                <div>
                  <p className="text-sm font-medium text-text">{tc.course.name}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {DAYS[tc.slot.dayOfWeek]} {tc.slot.startTime}–{tc.slot.endTime}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                  {status === "UNCONFIRMED" && tc.attendanceRecord && (
                    <div className="flex gap-1">
                      <button onClick={() => void resolveRecord(tc.attendanceRecord!.id, "ATTENDED")}
                        className="rounded-lg bg-[#1a2e23] px-3 py-1.5 text-[11px] font-medium text-[#5ce09e] transition-colors hover:bg-[#253b2e]">
                        Yes
                      </button>
                      <button onClick={() => void resolveRecord(tc.attendanceRecord!.id, "MISSED")}
                        className="rounded-lg bg-[#3a1e24] px-3 py-1.5 text-[11px] font-medium text-[#f0a6a6] transition-colors hover:bg-[#4a2e34]">
                        No
                      </button>
                      <button onClick={() => void resolveRecord(tc.attendanceRecord!.id, "CANCELLED")}
                        className="rounded-lg bg-surface-elevated px-3 py-1.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-border">
                        Cancelled
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* History */}
      {tab === "history" && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-text-muted">Attendance history</h2>
          {history.length === 0 && !loading && (
            <div className="rounded-2xl border border-dashed border-border py-12 text-center">
              <p className="text-sm text-text-muted">No attendance records yet.</p>
            </div>
          )}
          {history.map((day) => (
            <div key={day.date}>
              <p className="mb-2 text-xs font-medium text-text-muted">{day.date}</p>
              <div className="space-y-1">
                {day.records.map((r) => {
                  const style = STATUS_STYLES[r.status];
                  return (
                    <div
                      key={r.id}
                      data-record-id={r.id}
                      className={`flex items-center justify-between gap-3 rounded-lg bg-surface px-4 py-2.5 transition-shadow ${
                        focused === r.id ? "ring-1 ring-accent" : ""
                      }`}
                    >
                      <span className="text-sm text-text">{r.course.name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                        {/* A record can still be unanswered here: the class was
                            on a day that has already rolled over, and a prompt
                            for it may have arrived after midnight. Answering must
                            be possible wherever the record is shown, or the
                            notification that links here is a dead end. */}
                        {r.status === "UNCONFIRMED" && (
                          <div className="flex gap-1">
                            <button onClick={() => void resolveRecord(r.id, "ATTENDED")}
                              className="rounded-lg bg-[#1a2e23] px-2.5 py-1 text-[11px] font-medium text-[#5ce09e] transition-colors hover:bg-[#253b2e]">
                              Yes
                            </button>
                            <button onClick={() => void resolveRecord(r.id, "MISSED")}
                              className="rounded-lg bg-[#3a1e24] px-2.5 py-1 text-[11px] font-medium text-[#f0a6a6] transition-colors hover:bg-[#4a2e34]">
                              No
                            </button>
                            <button onClick={() => void resolveRecord(r.id, "CANCELLED")}
                              className="rounded-lg bg-surface-elevated px-2.5 py-1 text-[11px] font-medium text-text-muted transition-colors hover:bg-border">
                              Cancelled
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </AppShell>
  );
}