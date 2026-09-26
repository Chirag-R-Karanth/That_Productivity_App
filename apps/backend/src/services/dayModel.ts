/**
 * The day model.
 *
 * This is where the app's central question gets answered: "what do I need to
 * do, and what actually matters right now?" Everything the Today screen shows
 * is derived here from four sources of truth:
 *
 *   - the academic timetable  (Course.schedule JSON)
 *   - calendar events         (LOCAL + GOOGLE)
 *   - focus sessions          (PomodoroSession)
 *   - tasks                   (plannedDate / dueDate / estimateMinutes)
 *
 * The important idea is that capacity is computed from *gaps*, not from a
 * subtraction. `window - fixedMinutes` is a lie: a ten-minute hole between two
 * classes is not ten minutes of usable work, because you have to walk there.
 * So commitments are merged, padded with a transition buffer, and only the
 * space genuinely left over is offered as available time.
 */

import { prisma } from '../lib/prisma.js';
import { dedupeEvents } from './calendarDedup.js';
import {
  resolveDay,
  termOrigin,
  toResolvableCourse,
  toResolvableEntry,
  weekStartOf,
} from './timetableResolver.js';
import {
  addDaysTz,
  dayEndUtc,
  dayKeyInTz,
  dayStartUtc,
  minutesIntoDay,
  minutesOfDayInTz,
} from '../lib/tz.js';
import type {
  Capacity,
  CapacityVerdict,
  DayModel,
  DayPhase,
  DayProgress,
  Displacement,
  FreeBlock,
  Task,
  TimelineBlock,
} from '@prodapp/shared-types';

// Defaults applied in code so a null column means "unset", never "zero minutes".
export const DEFAULT_DAY_START = 7 * 60; // 07:00
export const DEFAULT_DAY_END = 23 * 60; // 23:00
export const DEFAULT_BUFFER = 10; // minutes either side of a commitment
/** A gap shorter than this is not worth surfacing as usable time. */
export const MIN_FREE_BLOCK = 20;

export interface DayModelInput {
  userId: string;
  /** YYYY-MM-DD in the user's local timezone. */
  date: string;
  /** Injected so a single request is internally consistent. */
  now: Date;
  /** IANA zone the day boundaries are resolved in. Defaults to UTC. */
  tz?: string;
}

export interface DayCapacitySettings {
  dayStartMinutes: number;
  dayEndMinutes: number;
  bufferMinutes: number;
}

interface Interval {
  start: number;
  end: number;
}

/** "HH:MM" → minutes from midnight. Returns null on anything unparseable. */
function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** Union of intervals, sorted, touching/overlapping runs collapsed. */
function mergeIntervals(input: Interval[]): Interval[] {
  if (input.length === 0) return [];
  const sorted = [...input].sort((a, b) => a.start - b.start);
  const out: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function clip(intervals: Interval[], lo: number, hi: number): Interval[] {
  return intervals
    .map((i) => ({ start: Math.max(i.start, lo), end: Math.min(i.end, hi) }))
    .filter((i) => i.end > i.start);
}

function totalMinutes(intervals: Interval[]): number {
  return intervals.reduce((acc, i) => acc + (i.end - i.start), 0);
}

/** Invert a set of intervals within [lo,hi] to get the gaps between them. */
function invert(intervals: Interval[], lo: number, hi: number): Interval[] {
  const merged = mergeIntervals(clip(intervals, lo, hi));
  const gaps: Interval[] = [];
  let cursor = lo;
  for (const i of merged) {
    if (i.start > cursor) gaps.push({ start: cursor, end: i.start });
    cursor = Math.max(cursor, i.end);
  }
  if (cursor < hi) gaps.push({ start: cursor, end: hi });
  return gaps;
}

export function dayPhaseFor(date: Date): DayPhase {
  const h = date.getHours();
  if (h < 5) return 'night';
  if (h < 9) return 'dawn';
  if (h < 12) return 'morning';
  if (h < 14) return 'midday';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

export function formatClock(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** "3h 40m" / "45m" — the unit people actually think in. */
export function humanDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function verdictFor(delta: number, planned: number): CapacityVerdict {
  if (planned === 0) return 'open';
  if (delta >= 60) return 'light';
  if (delta >= 0) return 'balanced';
  if (delta >= -60) return 'tight';
  return 'over';
}

function capacityHeadline(
  verdict: CapacityVerdict,
  available: number,
  planned: number,
): string {
  const avail = humanDuration(available);
  const plan = humanDuration(planned);
  switch (verdict) {
    case 'open':
      return planned === 0
        ? `${avail} free. Nothing demanding your attention.`
        : `${avail} free, ${plan} planned.`;
    case 'light':
      return `${avail} usable · ${plan} planned. Room to breathe.`;
    case 'balanced':
      return `${avail} usable · ${plan} planned. The day fits.`;
    case 'tight':
      return `${avail} usable, ${plan} planned. Slightly over — something small has to give.`;
    case 'over':
      return `${avail} usable, ${plan} planned. This day does not fit.`;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Prisma Task → shared Task. The wire format carries ISO strings, so the
 * conversion has to be explicit rather than an unchecked cast.
 */
type PrismaTaskRow = {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  dueTime: string | null;
  plannedDate: string | null;
  estimateMinutes: number | null;
  completed: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  courseId: string | null;
  course?: { name: string; code: string | null } | null;
  recurrenceRule: string | null;
  lastCompletedOccurrence: string | null;
  deletedAt: Date | null;
};

function toSharedTask(t: PrismaTaskRow): Task {
  return {
    id: t.id,
    userId: t.userId,
    title: t.title,
    notes: t.notes,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    plannedDate: t.plannedDate,
    estimateMinutes: t.estimateMinutes,
    completed: t.completed,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    priority: t.priority,
    deletedAt: t.deletedAt?.toISOString() ?? null,
    courseId: t.courseId,
    courseName: t.course?.name ?? null,
    recurrenceRule: t.recurrenceRule,
    isRecurring: !!t.recurrenceRule,
    lastCompletedOccurrence: t.lastCompletedOccurrence,
    displayDate: t.dueDate,
    nextOccurrence: null,
  };
}

/**
 * Full model of a single day. One call, one consistent `now`, so the timeline
 * and the "is this happening right now" flags can never disagree.
 */
export async function buildDayModel(input: DayModelInput): Promise<DayModel> {
  const { userId, date, now } = input;
  // Every day boundary below is resolved in the user's own zone, so a server in
  // UTC does not hand back yesterday's morning to someone in Kolkata.
  const tz = input.tz ?? "UTC";
  const isToday = date === dayKeyInTz(now, tz);
  const nowMinutes = minutesOfDayInTz(now, tz);

  const weekStart = weekStartOf(date);

  const [user, courses, excludedCalendars, tasks, sessions, timetableEntries] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        dayStartMinutes: true,
        dayEndMinutes: true,
        bufferMinutes: true,
      },
    }),
    prisma.course.findMany({ where: { userId } }),
    // Calendars the user keeps synced but does not want counted as planned time.
    prisma.linkedGoogleCalendar.findMany({
      where: { userId, isLinked: true, includeInDay: false },
      select: { id: true },
    }),
    prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { plannedDate: date },
          { dueDate: date },
          { dueDate: { lt: date } },
        ],
      },
      include: { course: { select: { id: true, name: true, code: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.pomodoroSession.findMany({
      where: { userId, startedAt: { gte: dayStartUtc(date, tz), lt: dayEndUtc(date, tz) } },
      include: { task: { select: { id: true, title: true } } },
      orderBy: { startedAt: "asc" },
    }),
    // A dated holiday, exam or rescheduled class changes what the day looks
    // like, so the whole week is needed: a class moved *into* today is recorded
    // against its new date, not against today. The week is also widened by a
    // day on each side, because a class moved *out* of a Sunday lands on the
    // following Monday and must vacate the Sunday it was on.
    prisma.timetableEntry.findMany({
      where: { userId, date: { gte: addDaysTz(weekStart, -1), lte: addDaysTz(weekStart, 7) } },
      include: { course: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
  ]);
  // Events are read separately: the exclusion list is only known once the
  // calendar query above resolves, and a shared calendar kept out of the day
  // must not reserve capacity.
  const excludedCalendarIds = excludedCalendars.map((c) => c.id);
  // With nothing excluded there must be no filter at all. An `OR` that only
  // allowed a null calendar would silently drop every Google event, which is
  // the common case rather than the exception.
  const calendarVisibility =
    excludedCalendarIds.length > 0
      ? { OR: [{ sourceCalendarId: null }, { sourceCalendarId: { notIn: excludedCalendarIds } }] }
      : {};
  const rawEvents = await prisma.calendarEvent.findMany({
    where: {
      userId,
      isDeleted: false,
      startTime: { lt: dayEndUtc(date, tz) },
      endTime: { gt: dayStartUtc(date, tz) },
      ...calendarVisibility,
    },
    orderBy: { startTime: "asc" },
  });
  // Same meeting on two calendars is one thing to do, so it is counted once.
  // The stored rows are left alone; folding happens every time the day is built.
  const events = dedupeEvents(rawEvents).canonical;

  const settings: DayCapacitySettings = {
    dayStartMinutes: user?.dayStartMinutes ?? DEFAULT_DAY_START,
    dayEndMinutes: user?.dayEndMinutes ?? DEFAULT_DAY_END,
    bufferMinutes: user?.bufferMinutes ?? DEFAULT_BUFFER,
  };
  // A user who set a nonsensical window still gets a usable day.
  const winStart = Math.max(0, Math.min(settings.dayStartMinutes, settings.dayEndMinutes - 60));
  const winEnd = Math.max(winStart + 60, settings.dayEndMinutes);

  const timeline: TimelineBlock[] = [];
  const fixed: Interval[] = [];

  // ---- 1. Academic timetable -------------------------------------------------
  // Resolved through the shared resolver so the grid, the calendar and
  // attendance all agree on what happens today.
  const resolvableCourses = courses.map(toResolvableCourse);
  const occurrences = resolveDay(
    date,
    resolvableCourses,
    timetableEntries.map(toResolvableEntry),
    termOrigin(courses),
  ).filter((o) => o.happens);

  for (const occurrence of occurrences) {
    const start = parseClock(occurrence.startTime);
    const end = parseClock(occurrence.endTime);
    if (start === null || end === null || end <= start) continue;

    // Only a class reserves capacity. A holiday, exam or cancelled session is
    // context, not a commitment.
    if (occurrence.type === "CLASS" || occurrence.type === "LAB") {
      fixed.push({ start, end });
    }

    timeline.push({
      key: occurrence.key,
      kind: occurrence.type === "CLASS" || occurrence.type === "LAB" ? "class" : "event",
      title: occurrence.courseName,
      startMinutes: start,
      endMinutes: end,
      durationMinutes: end - start,
      isNow: isToday && nowMinutes >= start && nowMinutes < end,
      isPast: isToday ? nowMinutes >= end : false,
      color: null,
      meta: occurrence.location ?? occurrence.courseCode ?? null,
      taskId: null,
      courseId: occurrence.courseId || null,
      source: "TIMETABLE",
    });
  }

  // ---- 2. Calendar events (local + Google) -----------------------------------
  const dayStartMs = dayStartUtc(date, tz).getTime();
  const dayEndMs = dayEndUtc(date, tz).getTime();
  for (const ev of events) {
    const start = Math.max(0, Math.round((ev.startTime.getTime() - dayStartMs) / 60000));
    const rawEnd = Math.round((ev.endTime.getTime() - dayStartMs) / 60000);
    const end = Math.min(24 * 60, rawEnd);

    if (ev.allDay) {
      // All-day events are context, not commitment: they never consume capacity.
      timeline.push({
        key: `allday-${ev.id}`,
        kind: "event",
        title: ev.title,
        startMinutes: null,
        endMinutes: null,
        durationMinutes: null,
        isNow: false,
        isPast: false,
        color: ev.color,
        meta: ev.location ?? (ev.source === "GOOGLE" ? "Google · all day" : "All day"),
        taskId: null,
        courseId: null,
        source: ev.source,
      });
      continue;
    }

    if (end <= start) continue;
    fixed.push({ start, end });
    timeline.push({
      key: `event-${ev.id}`,
      kind: "event",
      title: ev.title,
      startMinutes: start,
      endMinutes: end,
      durationMinutes: end - start,
      isNow: isToday && nowMinutes >= start && nowMinutes < end,
      isPast: isToday ? nowMinutes >= end : false,
      color: ev.color,
      meta: ev.location ?? (ev.source === "GOOGLE" ? "Google Calendar" : "Event"),
      taskId: null,
      courseId: null,
      source: ev.source,
    });
  }

  // ---- 3. Focus blocks (what already happened) -------------------------------
  let focusMinutes = 0;
  let focusSessions = 0;
  for (const s of sessions) {
    const start = Math.max(0, Math.round((s.startedAt.getTime() - dayStartMs) / 60000));
    // Prefer measured time; fall back to the plan for rows predating the column.
    const span = s.actualMinutes ?? s.durationMinutes;
    const end = Math.min(24 * 60, start + span);
    if (s.completed) {
      focusMinutes += span;
      focusSessions += 1;
    }
    timeline.push({
      key: `focus-${s.id}`,
      kind: "focus",
      title: s.task?.title ?? "Focus session",
      startMinutes: start,
      endMinutes: end,
      durationMinutes: span,
      isNow: isToday && nowMinutes >= start && nowMinutes < end,
      isPast: isToday ? nowMinutes >= end : false,
      color: null,
      meta: s.completed ? `${span} min focused` : "cut short",
      taskId: s.taskId,
      courseId: null,
      source: "FOCUS",
    });
  }

  // ---- 4. Tasks: planned work and deadlines ----------------------------------
  const plannedTasks = tasks.filter((t) => t.plannedDate === date);
  const overdueUnplanned = tasks.filter(
    (t) => t.plannedDate !== date && (t.dueDate === date || (t.dueDate ?? "") < date),
  );

  let plannedMinutes = 0;
  for (const t of plannedTasks) {
    if (t.completed) continue;
    const est = t.estimateMinutes ?? 0;
    plannedMinutes += est;
    // Unestimated planned work still belongs on the timeline as an open promise,
    // but it must not pretend to have a duration.
    timeline.push({
      key: `plan-${t.id}`,
      kind: "plan",
      title: t.title,
      startMinutes: null,
      endMinutes: null,
      durationMinutes: est > 0 ? est : null,
      isNow: false,
      isPast: false,
      color: null,
      meta: est > 0 ? `${est} min planned` : "no estimate",
      taskId: t.id,
      courseId: t.courseId,
      source: "TASK",
    });
  }

  for (const t of overdueUnplanned) {
    if (t.completed) continue;
    timeline.push({
      key: `due-${t.id}`,
      kind: "deadline",
      title: t.title,
      startMinutes: null,
      endMinutes: null,
      durationMinutes: null,
      isNow: false,
      isPast: false,
      color: null,
      meta: t.dueDate && t.dueDate < date ? `overdue · was due ${t.dueDate}` : "due today",
      taskId: t.id,
      courseId: t.courseId,
      source: "TASK",
    });
  }

  // ---- 5. Capacity -----------------------------------------------------------
  const buffer = Math.max(0, settings.bufferMinutes);
  const fixedClipped = clip(fixed, winStart, winEnd);
  const fixedMerged = mergeIntervals(fixedClipped);
  // Pad each commitment run with transition time, then re-merge so adjacent
  // commitments do not each claim the same buffer.
  const padded = mergeIntervals(
    fixedMerged.map((i) => ({ start: i.start - buffer, end: i.end + buffer })),
  );
  const blocked = clip(padded, winStart, winEnd);
  const availableMinutes = Math.max(0, winEnd - winStart - totalMinutes(blocked));

  const freeAll = invert(blocked, winStart, winEnd).filter(
    (g) => g.end - g.start >= MIN_FREE_BLOCK,
  );
  const free: FreeBlock[] = freeAll.map((g) => ({
    startMinutes: g.start,
    endMinutes: g.end,
    durationMinutes: g.end - g.start,
  }));
  const remainingMinutes = isToday
    ? free.filter((f) => f.endMinutes > nowMinutes).reduce((acc, f) => acc + (f.endMinutes - Math.max(f.startMinutes, nowMinutes)), 0)
    : 0;

  const deltaMinutes = availableMinutes - plannedMinutes;
  const verdict = verdictFor(deltaMinutes, plannedMinutes);
  const capacity: Capacity = {
    windowStartMinutes: winStart,
    windowEndMinutes: winEnd,
    fixedMinutes: totalMinutes(fixedClipped),
    fixedCount: fixedMerged.length,
    availableMinutes,
    remainingMinutes,
    plannedMinutes,
    deltaMinutes,
    verdict,
    headline: capacityHeadline(verdict, availableMinutes, plannedMinutes),
  };

  // ---- 6. Progress -----------------------------------------------------------
  const completedToday = plannedTasks.filter((t) => t.completed);
  const progress: DayProgress = {
    tasksPlanned: plannedTasks.length,
    tasksDone: completedToday.length,
    completedMinutes: completedToday.reduce((acc, t) => acc + (t.estimateMinutes ?? 0), 0),
    focusMinutes,
    focusSessions,
  };

  timeline.sort((a, b) => {
    const av = a.startMinutes ?? Number.POSITIVE_INFINITY;
    const bv = b.startMinutes ?? Number.POSITIVE_INFINITY;
    if (av !== bv) return av - bv;
    return (a.durationMinutes ?? 0) - (b.durationMinutes ?? 0);
  });

  return {
    date,
    phase: dayPhaseFor(now),
    capacity,
    timeline,
    free,
    progress,
    planned: plannedTasks.map(toSharedTask),
    unplanned: overdueUnplanned.map(toSharedTask),
    serverNow: now.toISOString(),
  };
}

/**
 * Calendar-key helpers.
 *
 * These re-export the timezone-aware versions in `lib/tz.ts` under the names the
 * rest of the codebase already uses. `addDays` shifts on the calendar, so a
 * daylight-saving change never produces a repeated or skipped day.
 */
export const toDayKey = (d: Date, tz = "UTC") => dayKeyInTz(d, tz);
export const dayStart = (date: string, tz = "UTC") => dayStartUtc(date, tz);
export const dayEnd = (date: string, tz = "UTC") => dayEndUtc(date, tz);
export const addDays = (date: string, days: number, tz = "UTC") => addDaysTz(date, days, tz);

/**
 * What no longer fits, and where it could go.
 *
 * Deliberately advisory. The server computes the consequence of an
 * over-committed day and names the trade; it never moves a task on its own.
 * Choosing what slips is the user's call, and a tool that quietly reorders
 * someone's commitments is worse than no tool at all.
 */
export async function findDisplacements(
  userId: string,
  date: string,
  now: Date,
  lookAheadDays = 7,
  tz = "UTC",
): Promise<Displacement[]> {
  const today = await buildDayModel({ userId, date, now, tz });
  const overflow = today.capacity.deltaMinutes;
  if (overflow >= 0) return [];

  const candidates = today.planned.filter((t) => !t.completed && (t.estimateMinutes ?? 0) > 0);
  if (candidates.length === 0) return [];

  // Rank by how safe it is to move, not by importance. An absent deadline is
  // treated as "no pressure" and therefore the cheapest thing to defer, then
  // the furthest deadline, then priority. Something already overdue is never
  // ranked as movable — it is reported as blocked instead.
  const PRIORITY_RANK: Record<Task["priority"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const ranked = [...candidates].sort((a, b) => {
    const aDue = a.dueDate ?? "9999-12-31";
    const bDue = b.dueDate ?? "9999-12-31";
    if (aDue !== bDue) return aDue < bDue ? 1 : -1;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });

  // Look ahead for a day that can actually absorb the work.
  const future: { date: string; free: number }[] = [];
  for (let i = 1; i <= lookAheadDays; i++) {
    const d = addDaysTz(date, i, tz);
    const m = await buildDayModel({ userId, date: d, now, tz });
    const headroom = m.capacity.availableMinutes - m.capacity.plannedMinutes;
    if (headroom > 0) future.push({ date: d, free: headroom });
  }

  const out: Displacement[] = [];
  let remaining = Math.abs(overflow);
  let slot = 0;

  for (const t of ranked) {
    const est = t.estimateMinutes ?? 0;
    if (remaining <= 0) break;

    const due = t.dueDate;
    const isOverdue = due !== null && due < date;
    const dueSoon = due !== null && due <= addDays(date, 1);

    // Find the earliest future day with room for this task.
    while (slot < future.length && future[slot].free < est) slot++;
    const target = slot < future.length ? future[slot] : null;
    if (target) {
      future[slot] = { ...target, free: target.free - est };
    }

    let risk: Displacement["risk"] = "safe";
    let reason: string;
    if (isOverdue) {
      risk = "blocked";
      reason = "Already overdue — moving it hides the problem rather than solving it.";
    } else if (dueSoon) {
      risk = "tight";
      reason = due === date
        ? "Due today. Moving this is a decision, not a cleanup."
        : "Due tomorrow. There is very little room to be wrong about this.";
    } else {
      reason = due
        ? `Due ${due}. It can wait without costing you the deadline.`
        : "No deadline attached, so this is the cheapest thing to move.";
    }

    out.push({
      task: t,
      estimateMinutes: est,
      risk,
      reason,
      suggestedDate: target?.date ?? null,
      suggestedFreeMinutes: target?.free ?? 0,
    });

    if (risk !== "blocked") remaining -= est;
  }

  return out;
}

export { clamp01 };
