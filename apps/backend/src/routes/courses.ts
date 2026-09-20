import { Router } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { ApiError } from "../lib/errors.js";
import type { Course } from "@prodapp/shared-types";

const router: RouterType = Router();
router.use(requireAuth);
router.use(idempotency);

const scheduleSlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

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