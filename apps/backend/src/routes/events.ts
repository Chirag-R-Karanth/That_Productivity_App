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

/**
 * Where an event happened, so the bell can link to the thing rather than only
 * report that it occurred. Anything unrecognised lands on Today, which is the
 * one page guaranteed to be a sensible place to arrive.
 */
function linkFor(type: string): string {
  if (type.startsWith("ATTENDANCE")) return "/attendance";
  if (type.startsWith("FOCUS")) return "/zen";
  if (type.startsWith("TASK")) return "/tasks";
  if (type.startsWith("CALENDAR") || type.startsWith("CLASS")) return "/calendar";
  return "/";
}

// The notification feed behind the desktop bell.
//
// Two kinds of thing, because they want different things from a reader. An
// attendance record nobody has answered is still actionable and is therefore
// listed first, whatever its date; the event log behind it is history, and is
// only worth showing in order.
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const [events, pending] = await Promise.all([
      prisma.event.findMany({
        where: { userId: req.user.id },
        orderBy: { occurredAt: "desc" },
        take: 50,
      }),
      // A day back, not a day forward: an unanswered record from yesterday is
      // still unanswered, and hiding it behind a date boundary would quietly
      // drop the one item the bell exists to nag about.
      prisma.attendanceRecord.findMany({
        where: { userId: req.user.id, status: "UNCONFIRMED" },
        include: { course: { select: { name: true } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 20,
      }),
    ]);

    res.json({
      ok: true,
      data: {
        events: events.map((e) => ({
          id: e.id,
          type: e.type,
          title: summarize(e.type, (e.payload ?? {}) as Payload),
          occurredAt: e.occurredAt.toISOString(),
          url: linkFor(e.type),
        })),
        pendingAttendance: pending.map((r) => ({
          recordId: r.id,
          courseId: r.courseId,
          courseName: r.course.name,
          date: r.date,
          prompted: r.attendancePromptedAt != null,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;