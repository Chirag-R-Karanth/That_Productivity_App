import { Router } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { ApiError } from "../lib/errors.js";
import { COURSE_SLOT_TYPES } from "../lib/timetableKinds.js";
import type { Course, CourseSlotType } from "@prodapp/shared-types";
import { recordEvent } from "../services/events.js";
import { EventType } from "../generated/prisma/enums.js";

const router: RouterType = Router();
router.use(requireAuth);
router.use(idempotency);

/**
 * A weekly slot.
 *
 * `type`, `weekNumber` and `location` are optional and additive. zod strips
 * unknown keys, so leaving them out of this schema would silently discard a
 * lab label or a week-8-only restriction on every save — which is exactly the
 * kind of quiet data loss that makes a timetable untrustworthy.
 */
const scheduleSlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  type: z.enum(COURSE_SLOT_TYPES).optional(),
  weekNumber: z.number().int().min(1).max(60).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
}).refine(
  (s) => s.endTime > s.startTime,
  { message: 'endTime must be after startTime', path: ['endTime'] },
);

const createCourseSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).nullable().optional(),
  schedule: z.array(scheduleSlotSchema).optional(),
  attendanceThreshold: z.number().int().min(0).max(100).optional(),
});

const updateCourseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(50).nullable().optional(),
  schedule: z.array(scheduleSlotSchema).optional(),
  attendanceThreshold: z.number().int().min(0).max(100).optional(),
});

function toPublicCourse(c: {
  id: string;
  userId: string;
  name: string;
  code: string | null;
  schedule: unknown;
  attendanceThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}): Course {
  return {
    id: c.id,
    userId: c.userId,
    name: c.name,
    code: c.code,
    schedule: (c.schedule as Course["schedule"]) ?? [],
    attendanceThreshold: c.attendanceThreshold,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// List courses
router.get("/", async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({
      where: { userId: req.user.id },
      orderBy: { name: "asc" },
    });
    res.json({ ok: true, data: courses.map(toPublicCourse) });
  } catch (err) {
    next(err);
  }
});

// Create course
router.post("/", async (req, res, next) => {
  try {
    const body = createCourseSchema.parse(req.body);
    const course = await prisma.course.create({
      data: {
        userId: req.user.id,
        name: body.name,
        code: body.code ?? null,
        schedule: (body.schedule ?? []) as object[],
        attendanceThreshold: body.attendanceThreshold ?? 80,
      },
    });
    res.status(201).json({ ok: true, data: toPublicCourse(course) });
    if (course.schedule && Array.isArray(course.schedule) && course.schedule.length > 0) {
      recordEvent(req.user.id, EventType.CLASS_SCHEDULED, {
        courseId: course.id,
        courseName: course.name,
        schedule: course.schedule,
      });
    }
  } catch (err) {
    next(err);
  }
});

// Update course
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = updateCourseSchema.parse(req.body);

    const existing = await prisma.course.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) throw ApiError.notFound("Course not found");

    const course = await prisma.course.update({
      where: { id },
      data: {
        name: body.name,
        code: body.code,
        schedule: body.schedule !== undefined ? (body.schedule as object[]) : undefined,
        attendanceThreshold: body.attendanceThreshold,
      },
    });

    res.json({ ok: true, data: toPublicCourse(course) });
    if (course.schedule && Array.isArray(course.schedule) && course.schedule.length > 0) {
      recordEvent(req.user.id, EventType.CLASS_SCHEDULED, {
        courseId: course.id,
        courseName: course.name,
        schedule: course.schedule,
      });
    }
  } catch (err) {
    next(err);
  }
});

// Delete course
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.course.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) throw ApiError.notFound("Course not found");

    await prisma.course.delete({ where: { id } });
    res.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

// Live attendance summaries for all courses
router.get("/summaries", async (req, res, next) => {
  try {
    const userId = req.user.id;

    const courses = await prisma.course.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });

    const summaries = await Promise.all(
      courses.map(async (course) => {
        const records = await prisma.attendanceRecord.findMany({
          where: { courseId: course.id, userId },
        });

        const attended = records.filter((r) => r.status === "ATTENDED").length;
        const missed = records.filter((r) => r.status === "MISSED").length;
        const cancelled = records.filter((r) => r.status === "CANCELLED").length;
        const unconfirmed = records.filter((r) => r.status === "UNCONFIRMED").length;
        const resolved = attended + missed;
        const percentage = resolved > 0 ? Math.round((attended / resolved) * 100) : null;
        const requiredThreshold = course.attendanceThreshold;
        const atRisk = percentage !== null && percentage < requiredThreshold;

        return {
          course: toPublicCourse(course),
          attended,
          missed,
          cancelled,
          unconfirmed,
          percentage,
          requiredThreshold,
          atRisk,
        };
      }),
    );

    res.json({ ok: true, data: summaries });
  } catch (err) {
    next(err);
  }
});

export default router;