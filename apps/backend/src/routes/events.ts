import { Router } from "express";
import type { Router as RouterType } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router: RouterType = Router();

type EventTypeLabel =
  | "TASK_CREATED"
  | "TASK_COMPLETED"
  | "TASK_UNCOMPLETED"
  | "TASK_UPDATED"
  | "TASK_DELETED"
  | "FOCUS_STARTED"
  | "FOCUS_COMPLETED"
  | "FOCUS_CANCELLED"
  | "ATTENDANCE_RECORDED"
  | "CLASS_SCHEDULED"
  | "CALENDAR_EVENT_SYNCED"
  | "CALENDAR_EVENT_UPDATED"
  | "GOOGLE_TASK_SYNCED";

type Payload = Record<string, unknown>;

const LABELS: Record<EventTypeLabel, string> = {
  TASK_CREATED: "Task created",
  TASK_COMPLETED: "Task completed",
  TASK_UNCOMPLETED: "Task re-opened",
  TASK_UPDATED: "Task updated",
  TASK_DELETED: "Task deleted",
  FOCUS_STARTED: "Focus started",
  FOCUS_COMPLETED: "Focus completed",
  FOCUS_CANCELLED: "Focus cancelled",
  ATTENDANCE_RECORDED: "Attendance recorded",
  CLASS_SCHEDULED: "Class scheduled",
  CALENDAR_EVENT_SYNCED: "Calendar event synced",
  CALENDAR_EVENT_UPDATED: "Calendar event updated",
  GOOGLE_TASK_SYNCED: "Google Tasks synced",
};

function summarize(type: string, payload: Payload): string {
  const label = LABELS[type as EventTypeLabel] ?? type.replace(/_/g, " ").toLowerCase();
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : typeof payload.courseName === "string" && payload.courseName.trim()
        ? payload.courseName.trim()
        : "";
  return title ? `${label}: ${title}` : label;
}

// Recent activity feed (newest first). Powers the desktop notification bell.
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      where: { userId: req.user.id },
      orderBy: { occurredAt: "desc" },
      take: 50,
    });

    res.json({
      ok: true,
      data: events.map((e) => ({
        id: e.id,
        type: e.type,
        title: summarize(e.type, (e.payload ?? {}) as Payload),
        occurredAt: e.occurredAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;