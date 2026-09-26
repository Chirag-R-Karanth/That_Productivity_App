/**
 * Daily cron job that generates UNCONFIRMED attendance records for every
 * scheduled class. Runs at 06:00 server-local every day.
 *
 * For each course whose schedule includes today's day-of-week:
 *  1. Upsert an AttendanceRecord(courseId + today = UNCONFIRMED)
 *     — unique constraint on (courseId, date) prevents duplicates.
 *  2. (Phase 3b) Push an FCM notification with persistent action buttons
 *     asking "Attended [Course]? Yes / No / Cancelled".
 */
import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { addDaysTz, dayKeyInTz, minutesOfDayInTz } from "../lib/tz.js";
import { dismissAttendancePrompt } from "./attendanceNotifications.js";
import {
  resolveDay,
  generatesAttendance,
  termOrigin,
  toResolvableCourse,
  toResolvableEntry,
  weekStartOf,
  type ResolvableCourse,
} from "./timetableResolver.js";

/**
 * Which of a user's courses owe an attendance record for `now`.
 *
 * Deliberately routed through the same resolver the timetable grid and the day
 * model use, so a holiday or a cancelled session cannot leave a phantom record
 * behind — and so a lab, an exam or an internal slot is not silently counted
 * as a class the user has to prove they attended.
 */
async function attendanceCoursesFor(
  user: { id: string; timezone: string | null },
  now: Date,
): Promise<{ date: string; dueCourseIds: string[]; allCourseIds: string[] }> {
  const tz = user.timezone ?? "UTC";
  const date = dayKeyInTz(now, tz);
  const weekStart = weekStartOf(date);

  const [courses, entries] = await Promise.all([
    prisma.course.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    // A day either side of the week, so a class moved out of the week is seen
    // leaving and a class moved in from next week is seen arriving.
    prisma.timetableEntry.findMany({
      where: { userId: user.id, date: { gte: addDaysTz(weekStart, -1), lte: addDaysTz(weekStart, 7) } },
    }),
  ]);

  const resolvable: ResolvableCourse[] = courses.map(toResolvableCourse);
  const origin = termOrigin(courses);
  const due = courses.filter((course) => {
    const occurrences = resolveDay(
      date,
      resolvable,
      entries.map(toResolvableEntry),
      origin,
    ).filter((o) => o.courseId === course.id);
    return occurrences.some(generatesAttendance);
  });

  return {
    date,
    dueCourseIds: due.map((c) => c.id),
    allCourseIds: courses.map((c) => c.id),
  };
}

const toMinutes = (clock: string): number => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
};

/** Users who actually have a timetable worth generating for. */
async function usersWithCourses(): Promise<{ id: string; timezone: string | null }[]> {
  return prisma.user.findMany({
    where: { courses: { some: {} } },
    select: { id: true, timezone: true },
    orderBy: { id: "asc" },
  });
}

/**
 * Take down any prompt still asking about a record that has just been settled.
 *
 * Fire-and-forget on purpose: auto-mark runs over every user on a timer, and a
 * phone that cannot be reached must not hold up — or roll back — the
 * attendance write that has already been committed.
 */
function settle(recordId: string, userId: string): void {
  void dismissAttendancePrompt(userId, recordId).catch(() => {});
}

export async function generateTodayAttendance(
  now: Date = new Date(),
  /** Restrict to one user. Used by the checks; the cron always passes none. */
  onlyUserId?: string,
): Promise<{ generated: number; skipped: number }> {
  const users = (await usersWithCourses()).filter((u) => !onlyUserId || u.id === onlyUserId);
  let generated = 0;
  let skipped = 0;

  for (const user of users) {
    const { date, dueCourseIds, allCourseIds } = await attendanceCoursesFor(user, now);

    // A class cancelled after its record was made must not sit UNCONFIRMED and
    // then be auto-marked ATTENDED — the user was never expected to be there.
    // Only records the user has not touched are adjusted.
    const notDue = allCourseIds.filter((id) => !dueCourseIds.includes(id));
    if (notDue.length > 0) {
      const withdrawn = await prisma.attendanceRecord.updateMany({
        where: { courseId: { in: notDue }, date, status: "UNCONFIRMED" },
        data: { status: "CANCELLED", confirmedAt: now },
      });
      if (withdrawn.count > 0) {
        // A prompt may already be sitting in a tray for a class that turned out
        // not to happen. It is now answering a question nobody needs answered.
        const cancelled = await prisma.attendanceRecord.findMany({
          where: { userId: user.id, date, status: "CANCELLED", confirmedAt: now },
          select: { id: true },
        });
        for (const record of cancelled) settle(record.id, user.id);
      }
    }

    for (const courseId of dueCourseIds) {
      try {
        await prisma.attendanceRecord.upsert({
          where: { courseId_date: { courseId, date } },
          create: { courseId, userId: user.id, date, status: "UNCONFIRMED" },
          update: {}, // No-op if already exists
        });
        generated++;
      } catch (err) {
        console.error(`[attendance-cron] Failed for course ${courseId}:`, err);
        skipped++;
      }
    }
  }

  return { generated, skipped };
}

/**
 * Auto-mark records that have been UNCONFIRMED for longer than the
 * configured threshold. If user set attendanceAutoMarkHours = null,
 * records stay unconfirmed forever (no auto-mark).
 *
 * Runs every 15 minutes to catch newly-stale records.
 */
export async function autoMarkStaleRecords(
  now: Date = new Date(),
  /** Restrict to one user. Used by the checks; the cron always passes none. */
  onlyUserId?: string,
): Promise<{ marked: number }> {
  const users = await prisma.user.findMany({
    where: {
      attendanceAutoMarkHours: { not: null },
      ...(onlyUserId ? { id: onlyUserId } : {}),
    },
    select: { id: true, timezone: true, attendanceAutoMarkHours: true },
    orderBy: { id: "asc" },
  });

  let marked = 0;

  for (const user of users) {
    const hours = user.attendanceAutoMarkHours ?? 2;
    const cutoff = new Date(now.getTime() - hours * 3_600_000);
    // The cutoff date and clock are the *user's*, not the server's: a record for
    // a 09:00 class in Kolkata is not stale because it is 06:00 in UTC.
    const tz = user.timezone ?? "UTC";
    const cutoffDate = dayKeyInTz(cutoff, tz);
    const stale = await prisma.attendanceRecord.findMany({
      where: { userId: user.id, status: "UNCONFIRMED", date: { lte: cutoffDate } },
      include: { course: true },
    });

    // Judging a record against the clock needs the user's real timetable: a
    // class cancelled by an exception, or lost to a holiday, has already ended
    // for attendance purposes. Read it once for the user, not per record.
    const needsClock = stale.some((r) => r.date === cutoffDate);
    const [allCourses, cutoffEntries] = needsClock
      ? await Promise.all([
          prisma.course.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
          prisma.timetableEntry.findMany({
            where: {
              userId: user.id,
              date: { gte: addDaysTz(weekStartOf(cutoffDate), -1), lte: addDaysTz(weekStartOf(cutoffDate), 7) },
            },
          }),
        ])
      : [[], []];
    const cutoffResolvables = allCourses.map(toResolvableCourse);
    const cutoffOrigin = termOrigin(allCourses);
    const cutoffResolvableEntries = cutoffEntries.map(toResolvableEntry);

    for (const record of stale) {
      // Only today's record can be judged by the clock; older ones are past it
      // by definition.
      if (record.date === cutoffDate) {
        const minutes = minutesOfDayInTz(cutoff, tz);
        // The latest end among the *classes* that actually run that day, since
        // a record only exists because a class was due.
        const occurrences = resolveDay(
          record.date,
          cutoffResolvables,
          cutoffResolvableEntries,
          cutoffOrigin,
        ).filter((o) => o.courseId === record.courseId && generatesAttendance(o));
        const latestEnd = occurrences.reduce(
          (max, o) => Math.max(max, toMinutes(o.endTime)),
          -1,
        );
        if (Number.isNaN(latestEnd)) continue; // unparseable time: leave it alone
        if (latestEnd < 0) {
          // No class runs: the record is a leftover, not a pending answer.
          await prisma.attendanceRecord.update({
            where: { id: record.id },
            data: { status: "CANCELLED", confirmedAt: now },
          });
          settle(record.id, user.id);
          marked++;
          continue;
        }
        if (latestEnd >= minutes) continue; // still in progress
      }

      // Auto-mark as ATTENDED (forgiving default per spec)
      await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: { status: "ATTENDED", confirmedAt: now },
      });
      settle(record.id, user.id);
      marked++;
    }
  }

  return { marked };
}

/**
 * Start the attendance cron jobs.
 * - Generate records at 06:00 daily
 * - Auto-mark stale records every 15 minutes
 */
export function startAttendanceCron(): void {
  // Generate today's records at 06:00
  cron.schedule("0 6 * * *", async () => {
    console.log("[attendance-cron] Generating today's attendance records…");
    try {
      const result = await generateTodayAttendance();
      console.log(`[attendance-cron] Generated: ${result.generated}, Skipped: ${result.skipped}`);
    } catch (err) {
      console.error("[attendance-cron] Failed:", err);
    }
  });

  // Auto-mark stale records every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    try {
      const result = await autoMarkStaleRecords();
      if (result.marked > 0) {
        console.log(`[attendance-cron] Auto-marked ${result.marked} stale records as ATTENDED`);
      }
    } catch (err) {
      console.error("[attendance-cron] Auto-mark failed:", err);
    }
  });

  console.log("[attendance-cron] Cron jobs scheduled (generate @06:00, auto-mark every 15m)");
}

/**
 * Generate records on server startup for any classes that already have
 * a scheduled slot today but no record yet (e.g. server was down at 06:00).
 */
export async function generateCatchUp(): Promise<void> {
  const result = await generateTodayAttendance();
  if (result.generated > 0) {
    console.log(`[attendance-cron] Startup catch-up: generated ${result.generated} records for today`);
  }
}