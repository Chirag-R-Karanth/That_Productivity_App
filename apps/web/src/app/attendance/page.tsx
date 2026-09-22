"use client";

import { useState, useEffect, useRef } from "react";
import { animate } from "animejs";
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

export default function AttendancePage() {
  const [summaries, setSummaries] = useState<CourseAttendanceSummary[]>([]);
  const [today, setToday] = useState<TodayClass[]>([]);
  const [history, setHistory] = useState<{ date: string; records: AttendanceRecordWithCourse[] }[]>([]);
  const [tab, setTab] = useState<"today" | "history">("today");
  const [loading, setLoading] = useState(true);
  const gaugeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const run = async () => {
      const [s, t, h] = await Promise.all([
        api.get<CourseAttendanceSummary[]>("/api/courses/summaries"),
        api.get<TodayClass[]>("/api/attendance/today"),
        api.get<{ date: string; records: AttendanceRecordWithCourse[] }[]>("/api/attendance"),
      ]);
      if ("ok" in s && s.ok) setSummaries(s.data);
      if ("ok" in t && t.ok) setToday(t.data);
      if ("ok" in h && h.ok) setHistory(h.data);
      setLoading(false);
    };
    void run();
  }, []);

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
            <button key={t} onClick={() => setTab(t)}
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
            <div className="rounded-2xl border border-dashed border-border py-12 text-center">
              <p className="text-sm text-text-muted">No classes scheduled today.</p>
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
                    <div key={r.id} className="flex items-center justify-between rounded-lg bg-surface px-4 py-2.5">
                      <span className="text-sm text-text">{r.course.name}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${style.bg} ${style.text}`}>
                        {style.label}
                      </span>
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