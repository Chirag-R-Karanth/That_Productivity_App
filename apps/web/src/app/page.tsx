"use client";

import { useState, useEffect, useCallback } from "react";
import type { CourseAttendanceSummary, TodayClass, Task, FocusTimeSummary, CalendarEvent } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Reveal } from "@/components/Reveal";

function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const [summaries, setSummaries] = useState<CourseAttendanceSummary[]>([]);
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [doneTasks, setDoneTasks] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const [focusMinutes, setFocusMinutes] = useState(0);
  const [dateLabel] = useState(
    new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
  );

  const load = useCallback(async () => {
    const today = localDayKey(new Date().toISOString());
    const [s, t, tasksRes, focusRes, calRes] = await Promise.all([
      api.get<CourseAttendanceSummary[]>("/api/courses/summaries"),
      api.get<TodayClass[]>("/api/attendance/today"),
      api.get<Task[]>("/api/tasks?filter=today"),
      api.get<FocusTimeSummary>("/api/pomodoro/summary"),
      api.get<CalendarEvent[]>(`/api/calendar?from=${today}T00:00:00&to=${today}T23:59:59`),
    ]);
    if ("ok" in s && s.ok) setSummaries(s.data);
    if ("ok" in t && t.ok) setTodayClasses(t.data);
    if ("ok" in tasksRes && tasksRes.ok) {
      setTotalTasks(tasksRes.data.length);
      setDoneTasks(tasksRes.data.filter((task) => task.completed).length);
    }
    if ("ok" in focusRes && focusRes.ok) setFocusMinutes(focusRes.data.todayMinutes);
    return "ok" in calRes && calRes.ok ? (calRes.data as CalendarEvent[]) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    void (async () => {
      const updater = async () => {
        const calEvents = await load();
        const upcoming = calEvents
          .filter((e) => new Date(e.endTime) > new Date())
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        setNextEvent(upcoming[0] ?? null);
      };
      await updater();
      const interval = setInterval(() => void updater(), 60_000);
      return () => clearInterval(interval);
    })();
  }, [load]);

  const atRiskCount = summaries.filter((s) => s.atRisk).length;
  const pendingClasses = todayClasses.filter((c) => c.attendanceRecord?.status === "UNCONFIRMED").length;

  return (
    <AppShell>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-text-muted">{dateLabel}</p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Up next */}
        <Reveal delay={0}>
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">Up next</h2>
            {nextEvent ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-medium text-text">{nextEvent.title}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {new Date(nextEvent.startTime).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    {nextEvent.location && ` · ${nextEvent.location}`}
                  </p>
                </div>
                <span className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ backgroundColor: nextEvent.color ?? "#8fb0ff", color: "#0b0e14" }}>
                  {Math.ceil((new Date(nextEvent.startTime).getTime() - Date.now()) / 60000)} min
                </span>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                {todayClasses.length > 0 ? "All today&apos;s classes done." : "Nothing scheduled — enjoy the day."}
              </p>
            )}
          </section>
        </Reveal>

        {/* Focus time */}
        <Reveal delay={100}>
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">Focus time</h2>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-semibold tabular-nums text-text">
                <AnimatedNumber value={focusMinutes} />
              </span>
              <span className="mb-1 text-base text-text-muted">minutes today</span>
            </div>
          </section>
        </Reveal>

        {/* Tasks due today */}
        <Reveal delay={200}>
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">Tasks due today</h2>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-semibold tabular-nums text-text">
                <AnimatedNumber value={doneTasks} />
              </span>
              <span className="mb-1 text-base text-text-muted">of {totalTasks} done</span>
            </div>
          </section>
        </Reveal>

        {/* Attendance */}
        <Reveal delay={300}>
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">Attendance</h2>
            {summaries.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {summaries.slice(0, 6).map((s) => (
                    <div key={s.course.id} className="flex items-center justify-between rounded-xl bg-surface-elevated px-4 py-3">
                      <span className="truncate text-sm text-text">{s.course.name}</span>
                      <div className="ml-2 flex items-center gap-2">
                        {s.atRisk && (
                          <span className="rounded bg-[#3a1e24] px-1.5 py-0.5 text-[10px] font-medium text-[#f0a6a6]">AT RISK</span>
                        )}
                        <span className="tabular-nums text-sm font-semibold text-text">
                          {s.percentage !== null ? `${s.percentage}%` : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {pendingClasses > 0 && (
                  <p className="mt-3 text-xs text-text-muted">{pendingClasses} class{pendingClasses !== 1 ? "es" : ""} awaiting confirmation</p>
                )}
                {atRiskCount > 0 && (
                  <p className="mt-1 text-xs text-danger">{atRiskCount} course{atRiskCount !== 1 ? "s" : ""} below threshold</p>
                )}
              </>
            ) : (
              <p className="text-sm text-text-muted">No courses yet — add one to start tracking.</p>
            )}
          </section>
        </Reveal>
      </div>
    </AppShell>
  );
}