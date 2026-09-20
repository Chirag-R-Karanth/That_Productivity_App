import { Router } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { ApiError } from "../lib/errors.js";
import type { PomodoroSession, FocusTimeSummary } from "@prodapp/shared-types";

const router: RouterType = Router();
router.use(requireAuth);
router.use(idempotency);

const startSchema = z.object({
  taskId: z.string().nullable().optional(),
  durationMinutes: z.number().int().min(1).optional(),
});

const endSchema = z.object({
  completed: z.boolean(),
});

function toPublicSession(s: {
  id: string;
  userId: string;
  taskId: string | null;
  startedAt: Date;
  durationMinutes: number;
  completed: boolean;
  createdAt: Date;
}): PomodoroSession {
  return {
    id: s.id,
    userId: s.userId,
    taskId: s.taskId,
    startedAt: s.startedAt.toISOString(),
    durationMinutes: s.durationMinutes,
    completed: s.completed,
    createdAt: s.createdAt.toISOString(),
  };
}

// Today-based start-of-day for streak calculation (server-local).
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Start a pomodoro session. createdAt = when started; durationMinutes read
// from the running session at end time (client reports real duration).
router.post("/", async (req, res, next) => {
  try {
    const body = startSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw ApiError.notFound("User not found");

    const session = await prisma.pomodoroSession.create({
      data: {
        userId: req.user.id,
        taskId: body.taskId ?? null,
        startedAt: new Date(),
        durationMinutes: body.durationMinutes ?? user.pomodoroWorkMinutes ?? 25,
        completed: false, // ends only when the client calls /:id/end
      },
    });

    res.status(201).json({ ok: true, data: toPublicSession(session) });
  } catch (err) {
    next(err);
  }
});

// End a session. `completed: true` = delivered a full work interval.
router.patch("/:id/end", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = endSchema.parse(req.body);

    const session = await prisma.pomodoroSession.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!session) throw ApiError.notFound("Session not found");
    if (session.completed) throw ApiError.badRequest("Session already ended");

    const updated = await prisma.pomodoroSession.update({
      where: { id },
      data: { completed: body.completed },
    });

    res.json({ ok: true, data: toPublicSession(updated) });
  } catch (err) {
    next(err);
  }
});

// Focus-time summary for a window (defaults to a rolling 30 days).
router.get("/summary", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = startOfDay(new Date());
    const fromParam = (req.query.from as string) ?? new Date(today.getTime() - 30 * 86_400_000).toISOString();
    const toParam = (req.query.to as string) ?? new Date(today.getTime() + 86_400_000 - 1).toISOString();
    const from = new Date(fromParam);
    const to = new Date(toParam);

    const sessions = await prisma.pomodoroSession.findMany({
      where: {
        userId,
        startedAt: { gte: from, lte: to },
      },
      orderBy: { startedAt: "asc" },
    });

    const completed = sessions.filter((s) => s.completed);
    const totalMinutes = completed.reduce((acc, s) => acc + s.durationMinutes, 0);
    const sessionsCompleted = completed.length;
    const sessionsAbandoned = sessions.length - sessionsCompleted;

    const todayStart = startOfDay(new Date());
    const tomorrow = new Date(todayStart.getTime() + 86_400_000);
    const todayMinutes = completed
      .filter((s) => s.startedAt >= todayStart && s.startedAt < tomorrow)
      .reduce((acc, s) => acc + s.durationMinutes, 0);

    // Streak: count back from today while each day has >=1 completed session.
    let streakDays = 0;
    if (completed.length > 0) {
      const completedDays = new Set(
        completed.map((s) => startOfDay(s.startedAt).getTime()),
      );
      let cursor = todayStart.getTime();
      // If today has none yet, the streak counts from yesterday.
      if (!completedDays.has(cursor)) cursor -= 86_400_000;
      while (completedDays.has(cursor)) {
        streakDays++;
        cursor -= 86_400_000;
      }
    }

    const summary: FocusTimeSummary = {
      totalMinutes,
      sessionsCompleted,
      sessionsAbandoned,
      streakDays,
      todayMinutes,
    };

    res.json({ ok: true, data: summary });
  } catch (err) {
    next(err);
  }
});

// Recent sessions for the history panel.
router.get("/history", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10) || 20, 100);
    const sessions = await prisma.pomodoroSession.findMany({
      where: { userId: req.user.id },
      include: { task: { select: { title: true } } },
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    res.json({
      ok: true,
      data: sessions.map((s) => ({
        ...toPublicSession(s),
        taskTitle: s.task?.title ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;