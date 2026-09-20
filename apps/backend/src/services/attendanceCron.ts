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

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export async function generateTodayAttendance(): Promise<{ generated: number; skipped: number }> {
  const today = todayYMD();
  const todayDow = dayOfWeek(today);

  const courses = await prisma.course.findMany();
  let generated = 0;
  let skipped = 0;

  for (const course of courses) {
    const schedule = (course.schedule as unknown[]) as { dayOfWeek: number }[];
    const hasClassToday = schedule.some((s) => s.dayOfWeek === todayDow);
    if (!hasClassToday) {
      skipped++;
      continue;
    }

    try {
      await prisma.attendanceRecord.upsert({
        where: { courseId_date: { courseId: course.id, date: today } },
        create: {
          courseId: course.id,
          userId: course.userId,
          date: today,
          status: "UNCONFIRMED",
        },
        update: {}, // No-op if already exists
      });
      generated++;
    } catch (err) {
      console.error(`[attendance-cron] Failed for course ${course.id}:`, err);
      skipped++;
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
export async function autoMarkStaleRecords(): Promise<{ marked: number }> {
  const users = await prisma.user.findMany({
    where: { attendanceAutoMarkHours: { not: null } },
  });

  let marked = 0;

  for (const user of users) {
    const hours = user.attendanceAutoMarkHours ?? 2;
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);

    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const cutoffTime = `${String(cutoff.getHours()).padStart(2, "0")}:${String(cutoff.getMinutes()).padStart(2, "0")}`;

    // Records where date < cutoff, or date == cutoff but class time was earlier
    const stale = await prisma.attendanceRecord.findMany({
      where: {
        userId: user.id,
        status: "UNCONFIRMED",
        OR: [
          { date: { lt: cutoffDate } },
          { date: { equals: cutoffDate } },
        ],
      },
      include: { course: true },
    });

    for (const record of stale) {
      // Check the course's actual end time for today's class
      const schedule = (record.course.schedule as unknown[]) as { dayOfWeek: number; endTime: string }[];
      const [y, m, d] = record.date.split("-").map(Number);
      const recordDow = new Date(y, m - 1, d).getDay();
      const todaySlot = schedule.find((s) => s.dayOfWeek === recordDow);

      if (todaySlot && record.date === cutoffDate) {
        // For same-day records: only auto-mark if class end time is before cutoff
        if (todaySlot.endTime >= cutoffTime) continue;
      }

      // Auto-mark as ATTENDED (forgiving default per spec)
      await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: { status: "ATTENDED", confirmedAt: new Date() },
      });
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
  const today = todayYMD();
  const todayDow = dayOfWeek(today);

  const courses = await prisma.course.findMany();
  let generated = 0;

  for (const course of courses) {
    const schedule = (course.schedule as unknown[]) as { dayOfWeek: number }[];
    if (!schedule.some((s) => s.dayOfWeek === todayDow)) continue;

    try {
      await prisma.attendanceRecord.upsert({
        where: { courseId_date: { courseId: course.id, date: today } },
        create: {
          courseId: course.id,
          userId: course.userId,
          date: today,
          status: "UNCONFIRMED",
        },
        update: {},
      });
      generated++;
    } catch {
      // Unique constraint — already exists, skip silently
    }
  }

  if (generated > 0) {
    console.log(`[attendance-cron] Startup catch-up: generated ${generated} records for today`);
  }
}