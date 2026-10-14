import { Router } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { ApiError } from "../lib/errors.js";
import { recordEvent } from "../services/events.js";
import { dismissAttendancePrompt } from "../services/attendanceNotifications.js";
import { EventType } from "../generated/prisma/enums.js";
import type { AttendanceRecord, AttendanceRecordWithCourse, TodayClass, AttendanceStatus } from "@prodapp/shared-types";
import type { CourseScheduleSlot } from "@prodapp/shared-types";

const router: RouterType = Router();
router.use(requireAuth);
router.use(idempotency);

const resolveSchema = z.object({
  status: z.enum(["ATTENDED", "MISSED", "CANCELLED"]),
});

function toPublicRecord(r: {
  id: string;
  userId: string;
  courseId: string;
  date: string;
  status: "ATTENDED" | "MISSED" | "CANCELLED" | "UNCONFIRMED";
  confirmedAt: Date | null;
  createdAt: Date;
}, course?: { name: string; code: string | null; schedule: unknown; attendanceThreshold: number }): AttendanceRecordWithCourse {
  return {
    id: r.id,
    userId: r.userId,
    courseId: r.courseId,
    date: r.date,
    status: r.status as AttendanceStatus,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    course: course
      ? {
          id: r.courseId,
          userId: r.userId,
          name: course.name,
          code: course.code,
          schedule: (course.schedule as unknown as CourseScheduleSlot[]) ?? [],
          attendanceThreshold: course.attendanceThreshold,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.createdAt.toISOString(),
        }
      : (undefined as unknown as AttendanceRecordWithCourse["course"]),
  };
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * History window defaults. Fetching the history without explicit from/to should
 * never silently hide data, so the default is a generous full-range window
 * (never a single day, and never a hardcoded calendar year).
 */
const HISTORY_DEFAULT_FROM = "2000-01-01";
const HISTORY_DEFAULT_TO = "2100-12-31";

// Generate today's attendance records for all the user's courses that have a
// scheduled slot today (used by onboarding + when adding a course mid-day).
router.post("/generate", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = todayYMD();
    const todayDow = new Date().getDay();

    const courses = await prisma.course.findMany({ where: { userId } });
    const generated = [];

    for (const course of courses) {
      const schedule = (course.schedule as unknown[]) as CourseScheduleSlot[];
      if (!schedule.some((s) => s.dayOfWeek === todayDow)) continue;

      const record = await prisma.attendanceRecord.upsert({
        where: { courseId_date: { courseId: course.id, date: today } },
        create: {
          courseId: course.id,
          userId,
          date: today,
          status: "UNCONFIRMED",
        },
        update: {}, // No-op if a record already exists (never reset a resolved status)
      });
      generated.push(record);
    }

    res.json({ ok: true, data: generated.length });
  } catch (err) {
    next(err);
  }
});

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

// Get today's remaining classes
router.get("/today", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = todayYMD();
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const todayDow = dayOfWeek(today);

    const courses = await prisma.course.findMany({ where: { userId } });

    const todayClasses: TodayClass[] = [];

    for (const course of courses) {
      const schedule = (course.schedule as unknown[]) as CourseScheduleSlot[];
      const todaySlot = schedule.find((s) => s.dayOfWeek === todayDow);
      if (!todaySlot) continue;

      // Find attendance record for today
      const record = await prisma.attendanceRecord.findUnique({
        where: { courseId_date: { courseId: course.id, date: today } },
      });

      todayClasses.push({
        course: {
          id: course.id,
          userId: course.userId,
          name: course.name,
          code: course.code,
          schedule: course.schedule as unknown as CourseScheduleSlot[],
          attendanceThreshold: course.attendanceThreshold,
          createdAt: course.createdAt.toISOString(),
          updatedAt: course.updatedAt.toISOString(),
        },
        slot: todaySlot,
        attendanceRecord: record
          ? {
              id: record.id,
              userId: record.userId,
              courseId: record.courseId,
              date: record.date,
              status: record.status as AttendanceStatus,
              confirmedAt: record.confirmedAt?.toISOString() ?? null,
              createdAt: record.createdAt.toISOString(),
            }
          : null,
      });
    }

    // Sort by start time
    todayClasses.sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));

    res.json({ ok: true, data: todayClasses });
  } catch (err) {
    next(err);
  }
});

// List attendance records in a date range
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const from = (req.query.from as string) ?? HISTORY_DEFAULT_FROM;
    const to = (req.query.to as string) ?? HISTORY_DEFAULT_TO;

    const records = await prisma.attendanceRecord.findMany({
      where: {
        userId,
        date: { gte: from, lte: to },
      },
      include: { course: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    // Group by date
    const byDate = new Map<string, AttendanceRecordWithCourse[]>();
    for (const r of records) {
      const entry = toPublicRecord(r, r.course);
      const existing = byDate.get(r.date) ?? [];
      existing.push(entry);
      byDate.set(r.date, existing);
    }

    const days = Array.from(byDate.entries())
      .map(([date, records]) => ({ date, records }))
      .sort((a, b) => b.date.localeCompare(a.date));

    res.json({ ok: true, data: days });
  } catch (err) {
    next(err);
  }
});

// Resolve an attendance record (user taps Yes/No/Cancelled)
router.patch("/:id/resolve", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = resolveSchema.parse(req.body);

    const record = await prisma.attendanceRecord.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!record) throw ApiError.notFound("Attendance record not found");
    if (record.status !== "UNCONFIRMED") {
      throw ApiError.badRequest("Record already resolved");
    }

    const updated = await prisma.attendanceRecord.update({
      where: { id },
      data: {
        status: body.status,
        confirmedAt: new Date(),
      },
    });

    res.json({
      ok: true,
      data: {
        id: updated.id,
        userId: updated.userId,
        courseId: updated.courseId,
        date: updated.date,
        status: updated.status,
        confirmedAt: updated.confirmedAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
    recordEvent(req.user.id, EventType.ATTENDANCE_RECORDED, {
      recordId: updated.id,
      courseId: updated.courseId,
      date: updated.date,
      status: updated.status,
    });
    // The question has an answer now, so the notification asking it is taken
    // back down. Deliberately after the write and not awaited into it: a phone
    // that cannot be reached must not cost the user their attendance record.
    void dismissAttendancePrompt(req.user.id, updated.id).catch(() => {});
  } catch (err) {
    next(err);
  }
});

export default router;