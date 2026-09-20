import { Router } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { ApiError } from "../lib/errors.js";
import { recurrence } from "../services/recurrence.js";

const router: RouterType = Router();
router.use(requireAuth);
router.use(idempotency);

// --------------- Zod schemas ---------------

const createTaskSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(300),
    notes: z.string().nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    courseId: z.string().nullable().optional(),
    recurrenceRule: z.string().nullable().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  })
  .strict();

const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    notes: z.string().nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    courseId: z.string().nullable().optional(),
    recurrenceRule: z.string().nullable().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  })
  .strict();

const completeSchema = z.object({
  completed: z.boolean(),
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// --------------- Helpers ---------------

function enrich(task: {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  dueTime: string | null;
  completed: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  priority: "LOW" | "MEDIUM" | "HIGH";
  courseId: string | null;
  course?: { name: string } | null;
  recurrenceRule: string | null;
  lastCompletedOccurrence: string | null;
  deletedAt: Date | null;
}) {
  const isRecurring = !!task.recurrenceRule;
  const dtstart = task.dueDate
    ? recurrence.toDateTime(task.dueDate, task.dueTime)
    : new Date(task.createdAt);

  let displayDate: string | null = task.dueDate;
  let nextOccurrence: string | null = null;

  if (isRecurring && !task.completed) {
    nextOccurrence = recurrence.nextOccurrenceDate(
      task.recurrenceRule!,
      dtstart,
      task.lastCompletedOccurrence,
    );
    displayDate = nextOccurrence;
  }

  return {
    ...task,
    courseName: task.course?.name ?? null,
    isRecurring,
    displayDate,
    nextOccurrence,
  };
}

// --------------- Routes ---------------

// List tasks with optional filters
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const filter = (req.query.filter as string) ?? "all";
    const courseId = req.query.courseId as string | undefined;
    const sortBy = (req.query.sortBy as string) ?? "due_date";
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const dateRangeRe = /^\d{4}-\d{2}-\d{2}$/;
    if ((from && !dateRangeRe.test(from)) || (to && !dateRangeRe.test(to))) {
      throw ApiError.badRequest("from/to must be YYYY-MM-DD");
    }

    const where: Record<string, unknown> = {
      userId,
      deletedAt: null,
    };

    if (courseId) where.courseId = courseId;

    if (filter === "today") {
      // Pre-filter: only tasks where completed=false so we can compute
      // displayDate and check if it matches today.
      where.completed = false;
    } else if (filter === "overdue") {
      where.completed = false;
    }

    const tasks = await prisma.task.findMany({
      where,
      include: { course: { select: { name: true } } },
      orderBy:
        sortBy === "priority"
          ? { priority: "desc" }
          : sortBy === "created_at"
            ? { createdAt: "desc" }
            : { dueDate: "asc" },
    });

    let filtered = tasks.map(enrich);

    // Post-query filter for date-dependent logic (recurring tasks)
    const today = recurrence.todayYMD();

    if (filter === "today") {
      filtered = filtered.filter((t) => {
        if (t.isRecurring) {
          return t.displayDate === today;
        }
        return t.dueDate === today;
      });
    } else if (filter === "overdue") {
      filtered = filtered.filter((t) => {
        if (!t.displayDate) return false;
        return t.displayDate < today;
      });
    } else if (filter === "by-course" && courseId) {
      // Already filtered in where clause
    }
    // "all" returns everything non-deleted (including completed)
    if (filter === "all") {
      // Sort completed last
      filtered.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (sortBy === "due_date") {
          const da = a.displayDate ?? "9999-99-99";
          const db = b.displayDate ?? "9999-99-99";
          return da.localeCompare(db);
        }
        return 0;
      });
    }

    // Optional date window: keep tasks active within [from, to]. Fixed tasks
    // match on dueDate; recurring tasks on their next pending occurrence.
    if (from || to) {
      filtered = filtered.filter((t) => {
        const d = t.displayDate ?? t.dueDate;
        if (!d) return false;
        return (!from || d >= from) && (!to || d <= to);
      });
    }

    // Count completed in window (for dashboard totals)
    const completedCount = tasks.filter((t) => t.completed).length;

    res.json({
      ok: true,
      data: filtered,
      meta: { total: filtered.length, completed: completedCount },
    });
  } catch (err) {
    next(err);
  }
});

// Get occurrences for a recurring task in a date window
router.get("/occurrences", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const from = (req.query.from as string) ?? recurrence.todayYMD();
    const to = (req.query.to as string) ?? recurrence.addDays(from, 7).toISOString().slice(0, 10);

    const tasks = await prisma.task.findMany({
      where: { userId, deletedAt: null, recurrenceRule: { not: null } },
    });

    const result = tasks.map((task) => {
      const dtstart = task.dueDate
        ? recurrence.toDateTime(task.dueDate, task.dueTime)
        : new Date(task.createdAt);
      const occurrences = recurrence.getOccurrencesInWindow(
        task.recurrenceRule!,
        dtstart,
        from,
        to,
        task.lastCompletedOccurrence,
      );
      return { taskId: task.id, title: task.title, occurrences };
    });

    res.json({ ok: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Create task (with optional client id for idempotency)
router.post("/", async (req, res, next) => {
  try {
    const body = createTaskSchema.parse(req.body);

    let task;
    try {
      task = await prisma.task.create({
        data: {
          id: body.id,
          userId: req.user.id,
          title: body.title,
          notes: body.notes ?? null,
          dueDate: body.dueDate ?? null,
          dueTime: body.dueTime ?? null,
          courseId: body.courseId ?? null,
          recurrenceRule: body.recurrenceRule ?? null,
          priority: body.priority ?? "MEDIUM",
          lastCompletedOccurrence: null,
          completed: false,
        },
        include: { course: { select: { name: true } } },
      });
    } catch (e: unknown) {
      // P2002 = unique constraint violation on id (idempotent replay)
      if (
        e instanceof Error &&
        "code" in e &&
        (e as { code?: string }).code === "P2002" &&
        body.id
      ) {
        task = await prisma.task.findUnique({
          where: { id: body.id },
          include: { course: { select: { name: true } } },
        });
        if (!task) throw e;
      } else {
        throw e;
      }
    }

    res.status(201).json({ ok: true, data: enrich(task) });
  } catch (err) {
    next(err);
  }
});

// Update task
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = updateTaskSchema.parse(req.body);

    const existing = await prisma.task.findFirst({
      where: { id, userId: req.user.id, deletedAt: null },
    });
    if (!existing) throw ApiError.notFound("Task not found");

    // If recurrence rule is changing, reset completion pointer
    if (
      body.recurrenceRule !== undefined &&
      body.recurrenceRule !== existing.recurrenceRule
    ) {
      (body as Record<string, unknown>).lastCompletedOccurrence = null;
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        title: body.title,
        notes: body.notes,
        dueDate: body.dueDate,
        dueTime: body.dueTime,
        courseId: body.courseId,
        recurrenceRule: body.recurrenceRule,
        priority: body.priority,
      } as Record<string, unknown>,
      include: { course: { select: { name: true } } },
    });

    res.json({ ok: true, data: enrich(task) });
  } catch (err) {
    next(err);
  }
});

// Complete / uncomplete a task or a single occurrence
router.post("/:id/complete", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = completeSchema.parse(req.body);

    const existing = await prisma.task.findFirst({
      where: { id, userId: req.user.id, deletedAt: null },
    });
    if (!existing) throw ApiError.notFound("Task not found");

    const isRecurring = !!existing.recurrenceRule;

    // --- Recurring occurrence completion ---
    if (isRecurring && body.occurrenceDate) {
      const dtstart = existing.dueDate
        ? recurrence.toDateTime(existing.dueDate, existing.dueTime)
        : new Date(existing.createdAt);

      let newLastCompleted = existing.lastCompletedOccurrence;

      if (body.completed) {
        // Linear: move pointer forward if this date is later
        if (
          !newLastCompleted ||
          body.occurrenceDate > newLastCompleted
        ) {
          newLastCompleted = body.occurrenceDate;
        }
      } else {
        // Un-complete: move pointer back to previous occurrence before this date
        if (newLastCompleted === body.occurrenceDate) {
          newLastCompleted = recurrence.previousOccurrence(
            existing.recurrenceRule!,
            dtstart,
            body.occurrenceDate,
          );
        }
      }

      const task = await prisma.task.update({
        where: { id },
        data: { lastCompletedOccurrence: newLastCompleted },
        include: { course: { select: { name: true } } },
      });

      return res.json({ ok: true, data: enrich(task) });
    }

    // --- One-off (or base series) completion ---
    if (isRecurring && !body.occurrenceDate) {
      throw ApiError.badRequest(
        "Recurring tasks require an occurrenceDate to complete",
      );
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        completed: body.completed,
        completedAt: body.completed ? new Date() : null,
      },
      include: { course: { select: { name: true } } },
    });

    res.json({ ok: true, data: enrich(task) });
  } catch (err) {
    next(err);
  }
});

// Soft-delete a task
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.task.findFirst({
      where: { id, userId: req.user.id, deletedAt: null },
    });
    if (!existing) throw ApiError.notFound("Task not found");

    await prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
