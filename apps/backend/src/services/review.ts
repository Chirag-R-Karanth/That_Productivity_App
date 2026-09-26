/**
 * The review engine.
 *
 * The brief is explicit that "completed: 8/10 tasks" is not a review. So this
 * does not count outcomes — it compares *intent against reality* and looks for
 * behaviour that repeats:
 *
 *   Planned 6h  →  Completed 4h 12m        (did the day fit?)
 *   estimate 45m → actual 2h 10m, six times  (is this work underestimated?)
 *   38% of sessions abandoned               (does the timer not match the work?)
 *   deepest focus at 09:00                  (when does this person actually work?)
 *
 * Every claim carries the number of observations behind it. A pattern asserted
 * from two data points is a guess, and the UI is built to show the difference
 * rather than hide it.
 */

import { prisma } from '../lib/prisma.js';
import {
  addDaysTz,
  dayEndUtc,
  dayKeyInTz,
  dayStartUtc,
  minutesOfDayInTz,
  weekdayOfKey,
  zonedParts,
  type ZonedParts,
} from '../lib/tz.js';
import type {
  CourseAccuracy,
  DayPhase,
  Pattern,
  PeriodStats,
  ReviewDay,
  ReviewReport,
} from '@prodapp/shared-types';
import { buildDayModel, humanDuration } from './dayModel.js';

/** Below this many observations, a claim is reported as a tendency, not a pattern. */
const MIN_SAMPLES_FOR_PATTERN = 3;

/** Which part of the day an hour-of-day falls in. */
function phaseForHour(h: number): DayPhase {
  if (h < 5) return 'night';
  if (h < 9) return 'dawn';
  if (h < 12) return 'morning';
  if (h < 14) return 'midday';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

const PHASE_LABEL: Record<DayPhase, string> = {
  dawn: 'early morning',
  morning: 'morning',
  midday: 'midday',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'late at night',
};

export interface ReviewInput {
  userId: string;
  period: 'day' | 'week';
  /** Anchor date (YYYY-MM-DD, local). */
  date: string;
  now: Date;
  /** IANA zone the window is measured in. Defaults to UTC. */
  tz?: string;
}

export async function buildReview(input: ReviewInput): Promise<ReviewReport> {
  const { userId, period, date, now, tz = 'UTC' } = input;
  const spanDays = period === 'day' ? 1 : 7;
  const from = period === 'day' ? date : addDaysTz(date, -(spanDays - 1), tz);
  // Inclusive last day of the window. Sessions and completions are bucketed by
  // whole days, so the query range runs to the end of `to`.
  const to = addDaysTz(from, spanDays - 1, tz);

  const rangeStart = dayStartUtc(from, tz);
  const rangeEnd = dayEndUtc(to, tz);

  const [sessions, tasks, courses] = await Promise.all([
    prisma.pomodoroSession.findMany({
      where: { userId, startedAt: { gte: rangeStart, lt: rangeEnd } },
      include: { task: { select: { id: true, title: true, courseId: true, estimateMinutes: true } } },
      orderBy: { startedAt: "asc" },
    }),
    prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { plannedDate: { gte: from, lte: to } },
          { completedAt: { gte: rangeStart, lt: rangeEnd } },
        ],
      },
      include: { course: { select: { id: true, name: true } } },
    }),
    prisma.course.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);

  // ---- Per-day capacity, so planned can be compared against what was possible.
  const days: ReviewDay[] = [];
  for (let i = 0; i < spanDays; i++) {
    const d = addDaysTz(from, i, tz);
    const model = await buildDayModel({ userId, date: d, now, tz });
    days.push({
      date: d,
      plannedMinutes: model.capacity.plannedMinutes,
      availableMinutes: model.capacity.availableMinutes,
      focusMinutes: model.progress.focusMinutes,
      completedMinutes: model.progress.completedMinutes,
      tasksPlanned: model.progress.tasksPlanned,
      tasksCompleted: model.progress.tasksDone,
      overCapacity: model.capacity.verdict === "over" || model.capacity.verdict === "tight",
    });
  }

  const completedSessions = sessions.filter((s) => s.completed);
  const focusMinutes = completedSessions.reduce(
    (acc, s) => acc + (s.actualMinutes ?? s.durationMinutes),
    0,
  );
  const sessionsCompleted = completedSessions.length;
  const sessionsAbandoned = sessions.length - sessionsCompleted;

  // Work reserved for a day inside the window is what the plan committed to.
  const plannedInWindow = tasks.filter(
    (t) => t.plannedDate && t.plannedDate >= from && t.plannedDate <= to,
  );
  const completedTasks = tasks.filter(
    (t) => t.completed && t.completedAt && t.completedAt >= rangeStart && t.completedAt < rangeEnd,
  );

  // Completed is measured in the same unit as planned — the estimate — so the
  // comparison is like for like. Summing raw session time here would credit
  // three 25m sessions against a 60m estimate as 75m of "completed" work.
  const completedMinutes = plannedInWindow
    .filter((t) => t.completed)
    .reduce((acc, t) => acc + (t.estimateMinutes ?? 0), 0);

  // Work reserved for an earlier day in the window that is still open was
  // carried, not done. The final day is excluded: an unfinished task planned for
  // today has not been postponed yet.
  const rescheduled = plannedInWindow.filter(
    (t) => !t.completed && t.plannedDate !== null && t.plannedDate < to,
  );
  const rescheduledMinutes = rescheduled.reduce((acc, t) => acc + (t.estimateMinutes ?? 0), 0);

  // ---- Focus rhythm by hour of day -------------------------------------------
  const hourBuckets = new Array(24).fill(0) as number[];
  for (const s of completedSessions) {
    hourBuckets[zonedParts(new Date(s.startedAt), tz).hour] += s.actualMinutes ?? s.durationMinutes;
  }

  // ---- Estimate vs actual, per course ----------------------------------------
  // Rolled up per task first, then per course. Summing the estimate once per
  // session would triple-count a task estimate split across three sessions and
  // make chronic underestimation look like chronic competence.
  const accuracy: CourseAccuracy[] = [];
  {
    const perTask = new Map<string, { courseId: string; est: number; act: number }>();
    for (const s of completedSessions) {
      const courseId = s.task?.courseId;
      const est = s.task?.estimateMinutes ?? 0;
      if (!courseId || !s.taskId || est <= 0) continue; // unestimated work proves nothing
      const cur = perTask.get(s.taskId) ?? { courseId, est, act: 0 };
      cur.act += s.actualMinutes ?? s.durationMinutes;
      perTask.set(s.taskId, cur);
    }

    const byCourse = new Map<string, { est: number; act: number; n: number }>();
    for (const row of perTask.values()) {
      const cur = byCourse.get(row.courseId) ?? { est: 0, act: 0, n: 0 };
      cur.est += row.est;
      cur.act += row.act;
      cur.n += 1;
      byCourse.set(row.courseId, cur);
    }

    for (const course of courses) {
      const row = byCourse.get(course.id);
      if (!row || row.est <= 0) continue;
      accuracy.push({
        courseId: course.id,
        courseName: course.name,
        estimatedMinutes: row.est,
        actualMinutes: row.act,
        ratio: row.act / row.est,
        samples: row.n,
      });
    }
    accuracy.sort((a, b) => b.ratio - a.ratio);
  }

  // Completion is measured against the plan: of the work reserved for this
  // window, how much of it landed. Counting completions of unplanned work would
  // let a busy day read as a well-planned one.
  const completedPlanned = plannedInWindow.filter((t) => t.completed).length;

  const stats: PeriodStats = {
    plannedMinutes: days.reduce((acc, d) => acc + d.plannedMinutes, 0),
    completedMinutes,
    focusMinutes,
    sessionsCompleted,
    sessionsAbandoned,
    tasksPlanned: plannedInWindow.length,
    tasksCompleted: completedPlanned,
    rescheduledMinutes,
    overloadedDays: days.filter((d) => d.overCapacity).length,
    completionRate: plannedInWindow.length > 0 ? completedPlanned / plannedInWindow.length : 0,
    focusByHour: hourBuckets.map((minutes, hour) => ({ hour, minutes })),
    accuracy,
  };

  return {
    period,
    from,
    to,
    stats,
    patterns: derivePatterns(stats, days, sessions.length),
    days,
    serverNow: now.toISOString(),
  };
}

/**
 * Turn measurements into a small number of honest statements.
 *
 * Each pattern is gated on sample size, and confidence is derived from that
 * sample size rather than asserted, so the UI can show "3 observations" next to
 * a weak claim and "19 observations" next to a strong one.
 */
function derivePatterns(
  stats: PeriodStats,
  days: ReviewDay[],
  sessionCount: number,
): Pattern[] {
  const out: Pattern[] = [];

  // 1. Chronic underestimation on a specific kind of work.
  for (const a of stats.accuracy) {
    if (a.samples < MIN_SAMPLES_FOR_PATTERN) continue;
    if (a.ratio >= 1.4) {
      out.push({
        id: `underestimate-${a.courseId}`,
        kind: "underestimate",
        title: `You consistently underestimate ${a.courseName}.`,
        detail:
          `Across ${a.samples} session${a.samples === 1 ? "" : "s"} you estimated ` +
          `${humanDuration(a.estimatedMinutes)} and spent ${humanDuration(a.actualMinutes)} — ` +
          `about ${Math.round((a.ratio - 1) * 100)}% longer. Plan roughly ${Math.ceil(a.ratio * 10) / 10}× for this.`,
        confidence: Math.min(1, a.samples / 12),
        samples: a.samples,
      });
    } else if (a.ratio <= 0.6) {
      out.push({
        id: `overestimate-${a.courseId}`,
        kind: "underestimate",
        title: `${a.courseName} is overestimated, not underestimated.`,
        detail:
          `You budgeted ${humanDuration(a.estimatedMinutes)} and finished in ` +
          `${humanDuration(a.actualMinutes)}. There is room here to plan more ambitiously.`,
        confidence: Math.min(1, a.samples / 12),
        samples: a.samples,
      });
    }
  }

  // 2. When the deep work actually happens.
  const activeHours = stats.focusByHour
    .filter((h) => h.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const totalFocus = stats.focusByHour.reduce((acc, h) => acc + h.minutes, 0);
  if (activeHours.length >= 2 && totalFocus > 0) {
    const peak = activeHours[0];
    const share = peak.minutes / totalFocus;
    if (share >= 0.3) {
      const phase = phaseForHour(peak.hour);
      const morningShare =
        stats.focusByHour.slice(5, 12).reduce((acc, h) => acc + h.minutes, 0) / totalFocus;
      out.push({
        id: "best-hour",
        kind: "best_hour",
        title:
          morningShare >= 0.5
            ? "Your longest focus sessions happen in the morning."
            : `Your focus concentrates around ${PHASE_LABEL[phase]}.`,
        detail:
          `${Math.round(peak.hour).toString().padStart(2, "0")}:00 holds ` +
          `${Math.round(share * 100)}% of your focused time. ` +
          (morningShare >= 0.5
            ? "Protect it — the rest of the day is not earning the same return."
            : "Planning your hardest work into this window is worth trying."),
        confidence: Math.min(1, share),
        samples: activeHours.length,
      });
    }
  }

  // 3. Work that keeps getting pushed rather than done.
  if (stats.rescheduledMinutes > 0 && stats.tasksPlanned > 0) {
    const movedShare = stats.rescheduledMinutes / Math.max(1, stats.plannedMinutes);
    if (movedShare >= 0.2) {
      out.push({
        id: "postponement",
        kind: "postponement",
        title: "Planned work is being postponed rather than finished.",
        detail:
          `${humanDuration(stats.rescheduledMinutes)} of planned work moved to a later day ` +
          `instead of being completed. This is the quiet way a plan stops being a plan.`,
        confidence: Math.min(1, movedShare * 2),
        samples: stats.tasksPlanned,
      });
    }
  }

  // 4. The timer does not match the work.
  if (sessionCount >= MIN_SAMPLES_FOR_PATTERN && stats.sessionsAbandoned > 0) {
    const abandonShare = stats.sessionsAbandoned / sessionCount;
    if (abandonShare >= 0.25) {
      out.push({
        id: "abandonment",
        kind: "abandonment",
        title: "You abandon a lot of focus sessions.",
        detail:
          `${stats.sessionsAbandoned} of ${sessionCount} sessions were cut short. ` +
          "The interval is probably shorter than the work actually needs.",
        confidence: Math.min(1, abandonShare),
        samples: sessionCount,
      });
    }
  }

  // 5. Over-committed days, which is a planning signal rather than a failing.
  if (stats.overloadedDays >= 2 && days.length >= 3) {
    out.push({
      id: "overload",
      kind: "overload",
      title: "You keep planning more than the day holds.",
      detail:
        `${stats.overloadedDays} of the last ${days.length} days were planned beyond usable time. ` +
        "The plan is not the problem to fix — the estimate of what fits is.",
      confidence: Math.min(1, stats.overloadedDays / days.length),
      samples: days.length,
    });
  }

  // 6. Momentum, when the numbers are genuinely good.
  if (
    stats.tasksPlanned >= 3 &&
    stats.completionRate >= 0.8 &&
    stats.sessionsAbandoned === 0
  ) {
    out.push({
      id: "steady",
      kind: "steady",
      title: "The plan and the day agreed with each other.",
      detail:
        `${stats.tasksCompleted} of ${stats.tasksPlanned} planned tasks completed, ` +
        "with no focus session abandoned. Whatever shaped this period is worth keeping.",
      confidence: stats.completionRate,
      samples: stats.tasksPlanned,
    });
  }

  return out;
}

export { dayKeyInTz as toDayKey, minutesOfDayInTz as minutesOfDay };
