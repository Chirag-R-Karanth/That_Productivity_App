import { Router } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { ApiError } from "../lib/errors.js";
import { recordEvent } from "../services/events.js";
import { EventType } from "../generated/prisma/enums.js";
import {
  resolveWeek,
  timeToMinutes,
  toResolvableCourse,
  toResolvableEntry,
  weekStartOf,
} from "../services/timetableResolver.js";
import { addDaysTz } from "../lib/tz.js";
import { TIMETABLE_ENTRY_KINDS } from "../lib/timetableKinds.js";
import type {
  TimetableEntry,
  TimetableEntryKind,
  TimetableOccurrence,
  TimetableWeek,
} from "@prodapp/shared-types";

const router: RouterType = Router();
router.use(requireAuth);
router.use(idempotency);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Rejects dates that parse but are not real, e.g. 2026-02-30, which would
 * otherwise be stored and then silently never match a resolved week.
 */
function assertRealDate(date: string): void {
  if (!DATE_RE.test(date)) throw ApiError.badRequest("date must be YYYY-MM-DD");
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
    throw ApiError.badRequest("date is not a real calendar date");
  }
}

const replacesSlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(CLOCK_RE),
  endTime: z.string().regex(CLOCK_RE),
});

const createSchema = z.object({
  courseId: z.string().min(1).nullable().optional(),
  title: z.string().min(1).max(200),
  kind: z.enum(TIMETABLE_ENTRY_KINDS).optional(),
  date: z.string().regex(DATE_RE),
  startTime: z.string().regex(CLOCK_RE).nullable().optional(),
  endTime: z.string().regex(CLOCK_RE).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  replacesSlot: replacesSlotSchema.nullable().optional(),
});

const updateSchema = createSchema.partial();

function toPublicEntry(
  e: {
    id: string;
    userId: string;
    courseId: string | null;
    title: string;
    kind: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    notes: string | null;
    replacesSlot: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  courseName?: string | null,
): TimetableEntry {
  return {
    id: e.id,
    userId: e.userId,
    courseId: e.courseId,
    courseName: courseName ?? null,
    title: e.title,
    kind: e.kind as TimetableEntryKind,
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    location: e.location,
    notes: e.notes,
    replacesSlot: (e.replacesSlot as TimetableEntry["replacesSlot"]) ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

const withCourse = { course: { select: { name: true } } } as const;

/** The entry must belong to a course the caller owns, or to none at all. */
async function assertCourseOwned(userId: string, courseId: string | null): Promise<void> {
  if (!courseId) return;
  const course = await prisma.course.findFirst({ where: { id: courseId, userId }, select: { id: true } });
  if (!course) throw ApiError.badRequest("courseId does not belong to you");
}

// ---------------------------------------------------------------------------
// Resolved week
// ---------------------------------------------------------------------------

/**
 * The timetable for a week, with the recurring schedule and every dated
 * exception already applied.
 */
router.get("/week", async (req, res, next) => {
  try {
    const week = typeof req.query.week === "string" ? req.query.week : undefined;
    if (week) assertRealDate(week);

    const weekStart = weekStartOf(week ?? new Date().toISOString().slice(0, 10));
    // Read one day either side so a RESCHEDULED entry landing on the boundary
    // still shows up in the week it moved into.
    const from = new Date(Date.parse(`${weekStart}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 8 * 86_400_000).toISOString().slice(0, 10);

    const [courses, entries] = await Promise.all([
      prisma.course.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "asc" } }),
      prisma.timetableEntry.findMany({
        where: { userId: req.user.id, date: { gte: from, lte: to } },
        include: withCourse,
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      }),
    ]);

    // Term week 1 is the week of the earliest course, so "week 8" means eight
    // weeks after the user started rather than snapping to the date's week.
    const origin = courses[0]?.createdAt.toISOString().slice(0, 10);

    const resolved: TimetableWeek = resolveWeek({
      weekStart,
      courses: courses.map(toResolvableCourse),
      entries: entries.map(toResolvableEntry),
      origin,
    });

    resolved.entries = resolved.entries.map((e) => toPublicEntry(
      entries.find((x) => x.id === e.id)!,
      entries.find((x) => x.id === e.id)!.course?.name ?? null,
    ));

    res.json({ ok: true, data: resolved });
  } catch (e) {
    next(e);
  }
});

/**
 * Resolved occurrences across a date range.
 *
 * The calendar needs the same answer the timetable grid and the day model get,
 * so it reads this instead of expanding `Course.schedule` itself. Two
 * independent implementations of "when does this class run" is how a holiday
 * ends up honoured in one view and ignored in another.
 */
router.get("/occurrences", async (req, res, next) => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    if (!from || !to) throw ApiError.badRequest("from and to are required (YYYY-MM-DD)");
    assertRealDate(from);
    assertRealDate(to);
    if (to < from) throw ApiError.badRequest("to must not be before from");

    const [courses, entries] = await Promise.all([
      prisma.course.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "asc" } }),
      prisma.timetableEntry.findMany({
        where: { userId: req.user.id, date: { gte: from, lte: to } },
        include: withCourse,
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      }),
    ]);

    const resolvable = courses.map(toResolvableCourse);
    const resolvableEntries = entries.map(toResolvableEntry);
    const origin = courses[0]?.createdAt.toISOString().slice(0, 10);

    // Resolve week by week: a rescheduled class can arrive from the week before
    // or land in the week after, and the ranges are inclusive of the edges.
    const out: TimetableOccurrence[] = [];
    const seen = new Set<string>();
    const firstWeek = weekStartOf(addDaysTz(from, -7));
    for (let cursor = firstWeek; cursor <= to; cursor = addDaysTz(cursor, 7)) {
      for (const o of resolveWeek({ weekStart: cursor, courses: resolvable, entries: resolvableEntries, origin })
        .occurrences) {
        if (o.date < from || o.date > to) continue;
        if (seen.has(o.key)) continue;
        seen.add(o.key);
        out.push(o);
      }
    }

    out.sort((a, b) =>
      a.date === b.date ? timeToMinutes(a.startTime) - timeToMinutes(b.startTime) : a.date < b.date ? -1 : 1,
    );
    res.json({ ok: true, data: out });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Entry CRUD
// ---------------------------------------------------------------------------

router.get("/entries", async (req, res, next) => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    if (from) assertRealDate(from);
    if (to) assertRealDate(to);

    const rows = await prisma.timetableEntry.findMany({
      where: {
        userId: req.user.id,
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: withCourse,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
    res.json({ ok: true, data: rows.map((e) => toPublicEntry(e, e.course?.name ?? null)) });
  } catch (e) {
    next(e);
  }
});

router.post("/entries", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    assertRealDate(body.date);
    await assertCourseOwned(req.user.id, body.courseId ?? null);
    if (body.startTime && body.endTime && body.endTime <= body.startTime) {
      throw ApiError.badRequest("endTime must be after startTime");
    }

    const row = await prisma.timetableEntry.create({
      data: {
        userId: req.user.id,
        courseId: body.courseId ?? null,
        title: body.title,
        kind: (body.kind ?? "EVENT") as never,
        date: body.date,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
        location: body.location ?? null,
        notes: body.notes ?? null,
        replacesSlot: (body.replacesSlot ?? null) as never,
      },
      include: withCourse,
    });
    recordEvent(req.user.id, EventType.TASK_UPDATED, { timetableEntryId: row.id, action: "created" });
    res.status(201).json({ ok: true, data: toPublicEntry(row, row.course?.name ?? null) });
  } catch (e) {
    next(e);
  }
});

router.patch("/entries/:id", async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    if (body.date) assertRealDate(body.date);
    if (body.courseId !== undefined) await assertCourseOwned(req.user.id, body.courseId ?? null);

    const existing = await prisma.timetableEntry.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound("Entry not found");

    const start = body.startTime ?? undefined;
    const end = body.endTime ?? undefined;
    if (start && end && end <= start) throw ApiError.badRequest("endTime must be after startTime");

    const row = await prisma.timetableEntry.update({
      where: { id: req.params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.kind !== undefined ? { kind: body.kind as never } : {}),
        ...(body.date !== undefined ? { date: body.date } : {}),
        ...(body.startTime !== undefined ? { startTime: body.startTime } : {}),
        ...(body.endTime !== undefined ? { endTime: body.endTime } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.replacesSlot !== undefined ? { replacesSlot: body.replacesSlot as never } : {}),
        // Null is meaningful here: it detaches the entry from a deleted course.
        ...(body.courseId !== undefined ? { courseId: body.courseId } : {}),
      },
      include: withCourse,
    });
    res.json({ ok: true, data: toPublicEntry(row, row.course?.name ?? null) });
  } catch (e) {
    next(e);
  }
});

router.delete("/entries/:id", async (req, res, next) => {
  try {
    const existing = await prisma.timetableEntry.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound("Entry not found");
    await prisma.timetableEntry.delete({ where: { id: req.params.id } });
    recordEvent(req.user.id, EventType.TASK_UPDATED, { timetableEntryId: req.params.id, action: "deleted" });
    res.json({ ok: true, data: { id: req.params.id } });
  } catch (e) {
    next(e);
  }
});

export default router;
