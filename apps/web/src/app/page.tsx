"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { CourseAttendanceSummary, TodayClass, Task, FocusTimeSummary, CalendarEvent } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Reveal } from "@/components/Reveal";
import { useAuth } from "@/lib/auth";
import { FocusIcon, TasksIcon, CalendarIcon, GraduationIcon, ArrowRightIcon } from "@/components/icons";

function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtHM(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

interface ScheduleItem {
  key: string;
  kind: "class" | "event";
  title: string;
  start: Date;
  end: Date;
  color: string | null;
  meta: string;
}

type Phase = "morning" | "midday" | "evening" | "night";

function dayPhase(h: number): { phase: Phase; greeting: string; chip: string } {
  if (h < 5) return { phase: "night", greeting: "Still up,", chip: "Late night · quiet hours" };
  if (h < 12) return { phase: "morning", greeting: "Good morning,", chip: "Morning · fresh start" };
  if (h < 17) return { phase: "midday", greeting: "Good afternoon,", chip: "Mid-day · keep going" };
  if (h < 21) return { phase: "evening", greeting: "Good evening,", chip: "Evening · wind down" };
  return { phase: "night", greeting: "Winding down,", chip: "Night · quiet hours" };
}

function buildSchedule(
  classes: TodayClass[],
  events: CalendarEvent[],
): { items: ScheduleItem[]; allDay: CalendarEvent[] } {
  const now = new Date();
  const items: ScheduleItem[] = classes.map((c, i) => ({
    key: `class-${c.course.id}-${i}`,
    kind: "class",
    title: c.course.name,
    start: new Date(`${now.toDateString()} ${c.slot.startTime}`),
    end: new Date(`${now.toDateString()} ${c.slot.endTime}`),
    color: null,
    meta: c.slot.startTime,
  }));

  for (const e of events) {
    if (e.allDay || e.isDeleted || e.isDedupedDuplicate) continue;
    items.push({
      key: `event-${e.id}`,
      kind: "event",
      title: e.title,
      start: new Date(e.startTime),
      end: new Date(e.endTime),
      color: e.color,
      meta: e.location ?? (e.source === "GOOGLE" ? "Google" : "Event"),
    });
  }

  items.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { items, allDay: events.filter((e) => e.allDay && !e.isDeleted) };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<CourseAttendanceSummary[]>([]);
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [focusMinutes, setFocusMinutes] = useState(0);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [now, setNow] = useState<Date>(() => new Date());

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
    if ("ok" in tasksRes && tasksRes.ok) setTasks(tasksRes.data);
    if ("ok" in focusRes && focusRes.ok) setFocusMinutes(focusRes.data.todayMinutes);
    if ("ok" in calRes && calRes.ok) setEvents(calRes.data);
  }, []);

  useEffect(() => {
    const updater = async () => {
      try {
        await load();
        setLoadError(false);
      } catch {
        // Refresh failures (offline, backend restarting) must not surface as
        // unhandled rejections — keep the last good state and surface a notice.
        setLoadError(true);
      }
    };
    void updater();
    const interval = setInterval(() => void updater(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  // Keep the clock + "min until next" honest between refreshes.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const { phase, greeting, chip } = dayPhase(hour);
  const displayName = (user?.name || "").trim() || user?.email.split("@")[0] || "friend";
  const initial = displayName.charAt(0).toUpperCase();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const timeLabel = fmtHM(now);

  const doneTasks = tasks.filter((t) => t.completed).length;
  const nextTask = useMemo(
    () => tasks.find((t) => !t.completed) ?? null,
    [tasks],
  );
  const atRiskCount = summaries.filter((s) => s.atRisk).length;
  const pendingClasses = todayClasses.filter((c) => c.attendanceRecord?.status === "UNCONFIRMED").length;

  const { items, allDay } = useMemo(() => buildSchedule(todayClasses, events), [todayClasses, events]);
  const nowMs = now.getTime();

  const upNext = useMemo(
    () => items.find((i) => i.end.getTime() > nowMs) ?? null,
    [items, nowMs],
  );

  // Free gaps between commitments (only meaningful ones that start in the future).
  const gaps = useMemo(() => {
    const out: { start: Date; end: Date }[] = [];
    for (let i = 0; i < items.length; i++) {
      const start = items[i].end;
      const end = i + 1 < items.length ? items[i + 1].start : null;
      if (!end) continue;
      if (start.getTime() > nowMs && end.getTime() >= start.getTime() + 30 * 60_000) {
        out.push({ start, end });
      }
    }
    return out;
  }, [items, nowMs]);

  const completeNextTask = async () => {
    if (!nextTask) return;
    const res = await api.post<Task>(`/api/tasks/${nextTask.id}/complete`, { completed: true });
    if ("ok" in res && res.ok) {
      setTasks((prev) => prev.map((t) => (t.id === nextTask.id ? { ...t, completed: true } : t)));
    }
  };

  const focusCTANow = upNext && upNext.start.getTime() - nowMs < 60 * 60_000;
  const ctaHint = upNext
    ? focusCTANow
      ? `Up next at ${fmtHM(upNext.start)}`
      : `Clear until ${fmtHM(upNext.start)}`
    : "No commitments scheduled";

  return (
    <AppShell>
      <Reveal delay={0}>
        {/* Hero */}
        <section className={`hero-${phase} -mx-4 -mt-6 px-4 pb-8 pt-8 lg:-mx-8 lg:-mt-8 lg:px-8`}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex items-start gap-4">
              <span
                aria-hidden
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-xl font-semibold text-white"
              >
                {initial}
              </span>
              <div>
                <p className="text-sm font-medium text-text-muted">{chip}</p>
                <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-text">
                  {greeting} {displayName}
                </h1>
                <p className="mt-1 text-sm text-text-muted">
                  {dateLabel} · {timeLabel}
                </p>
              </div>
            </div>

            {/* Focus CTA */}
            <div className="flex flex-col items-start gap-2">
              <Link
                href="/zen"
                className="focus-ring inline-flex items-center gap-2.5 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                <FocusIcon className="h-4 w-4" />
                Start focus
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <p className="flex items-center gap-1.5 text-xs text-text-muted">
                <FocusIcon className="h-3.5 w-3.5 text-accent" />
                <AnimatedNumber value={focusMinutes} /> min focused today
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      {loadError && (
        <div className="mb-6 rounded-xl border border-[#2a2438] bg-[#221d30] px-4 py-3 text-sm text-[#b3a6ff]">
          Can&apos;t reach the server right now — retrying automatically. Your local changes are safe.
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        {/* Today's schedule */}
        <Reveal delay={60} className="lg:col-span-3">
          <section className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 lg:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
                <CalendarIcon className="h-4 w-4" />
                Today&apos;s schedule
              </h2>
              <Link href="/calendar" className="text-xs text-text-muted transition-colors hover:text-text">
                Calendar →
              </Link>
            </div>

            {allDay.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {allDay.map((e) => (
                  <span key={e.id} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-text-muted">
                    All day · {e.title}
                  </span>
                ))}
              </div>
            )}

            {items.length === 0 && allDay.length === 0 ? (
              <p className="py-10 text-center text-sm text-text-muted">
                Nothing scheduled — enjoy the day.
              </p>
            ) : (
              <div className="flex-1 space-y-1.5">
                {items.map((item) => {
                  const isUpNext = upNext?.key === item.key;
                  const msLeft = item.start.getTime() - nowMs;
                  const inProgress = item.start.getTime() <= nowMs && item.end.getTime() > nowMs;
                  const dotColor = item.color ?? (item.kind === "class" ? "var(--t-accent)" : "#8fb0ff");
                  return (
                    <div
                      key={item.key}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                        isUpNext ? "bg-surface-elevated" : ""
                      }`}
                    >
                      <div className="w-20 shrink-0 text-xs tabular-nums text-text-muted">
                        {fmtHM(item.start)}
                        <span className="block text-[10px] text-text-muted/70">{fmtHM(item.end)}</span>
                      </div>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm ${inProgress ? "font-medium text-accent" : "text-text"}`}>
                          {item.title}
                          {inProgress && " · now"}
                        </p>
                        {item.meta && <p className="truncate text-[11px] text-text-muted">{item.meta}</p>}
                      </div>
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                        {item.kind}
                      </span>
                      {isUpNext && msLeft > 0 && (
                        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">
                          in {Math.ceil(msLeft / 60_000)}m
                        </span>
                      )}
                    </div>
                  );
                })}

                {gaps.map((g) => (
                  <div key={`gap-${g.start.getTime()}`} className="flex items-center gap-3 px-3 py-1.5">
                    <div className="w-20 shrink-0" />
                    <span className="h-px flex-1 border-t border-dashed border-border" />
                    <p className="shrink-0 text-[11px] italic text-text-muted">
                      Free · {fmtHM(g.start)} – {fmtHM(g.end)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </Reveal>

        {/* Next task + stats */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Reveal delay={120}>
            <section className="rounded-2xl border border-border bg-surface p-5 lg:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
                  <TasksIcon className="h-4 w-4" />
                  Next task
                </h2>
                <span className="text-xs text-text-muted">
                  {doneTasks}/{tasks.length} done
                </span>
              </div>

              {nextTask ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void completeNextTask()}
                    aria-label={`Complete ${nextTask.title}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    ✓
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-text">{nextTask.title}</p>
                    <p className="text-xs text-text-muted">
                      {nextTask.dueTime
                        ? `Due ${fmtHM(new Date(`${localDayKey(new Date().toISOString())}T${nextTask.dueTime}`))}`
                        : nextTask.dueDate
                          ? `Due ${new Date(`${nextTask.dueDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`
                          : "No due date"}
                      {nextTask.courseName ? ` · ${nextTask.courseName}` : ""}
                    </p>
                  </div>
                  <Link href="/tasks" className="shrink-0 text-xs text-text-muted hover:text-text">
                    All tasks →
                  </Link>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-text-muted">No tasks due today — enjoy the day.</p>
                  <Link href="/tasks?new=1" className="shrink-0 text-xs text-text-muted hover:text-text">
                    Add →
                  </Link>
                </div>
              )}
            </section>
          </Reveal>

          <Reveal delay={180}>
            <section className="rounded-2xl border border-border bg-surface p-5 lg:p-6">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
                <GraduationIcon className="h-4 w-4" />
                Day at a glance
              </h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Attendable classes</span>
                  <span className="font-medium tabular-nums text-text">{todayClasses.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Awaiting confirmation</span>
                  <span className="font-medium tabular-nums text-text">{pendingClasses}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Courses at risk</span>
                  <span className={`font-medium tabular-nums ${atRiskCount > 0 ? "text-danger" : "text-text"}`}>
                    {atRiskCount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Focus today</span>
                  <span className="font-medium tabular-nums text-text">{focusMinutes} min</span>
                </div>
              </div>
              <p className="mt-4 border-t border-border pt-3 text-xs text-text-muted">{ctaHint}</p>
            </section>
          </Reveal>
        </div>
      </div>
    </AppShell>
  );
}