import { Router } from "express";
import type { Router as RouterType } from "express";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../lib/errors.js";
import { env } from "../lib/env.js";
import { Prisma } from "../generated/prisma/client.js";
import { EventType, type TimetableEntryKind } from "../generated/prisma/enums.js";
import { TIMETABLE_ENTRY_KINDS, isTimetableEntryKind } from "../lib/timetableKinds.js";

const router: RouterType = Router();
router.use(requireAuth);

const SNAPSHOT_APP = "that-productivity-app";
const SNAPSHOT_VERSION = 1;
const SNAPSHOT_EXT = ".snapshot.json";

const ATTENDANCE_STATUSES = new Set(["ATTENDED", "MISSED", "CANCELLED", "UNCONFIRMED"]);
const CALENDAR_SOURCES = new Set(["LOCAL", "GOOGLE"]);
const EVENT_TYPES = new Set([
  "TASK_CREATED",
  "TASK_COMPLETED",
  "TASK_UNCOMPLETED",
  "TASK_UPDATED",
  "TASK_DELETED",
  "FOCUS_STARTED",
  "FOCUS_COMPLETED",
  "FOCUS_CANCELLED",
  "ATTENDANCE_RECORDED",
  "CLASS_SCHEDULED",
  "CALENDAR_EVENT_SYNCED",
  "CALENDAR_EVENT_UPDATED",
  "GOOGLE_TASK_SYNCED",
]);
const PENDING_STATUSES = new Set(["PENDING", "APPLIED", "FAILED"]);

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^\d{2}:\d{2}$/;

function snapshotsDir(): string {
  fs.mkdirSync(env.snapshotsDir, { recursive: true });
  return env.snapshotsDir;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

async function collectSnapshot(userId: string) {
  const [user, tasks, courses, attendance, calendarEvents, linkedCalendars, pomodoro, pendingSyncRows, events, timetableEntries] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.task.findMany({ where: { userId } }),
      prisma.course.findMany({ where: { userId } }),
      prisma.attendanceRecord.findMany({ where: { userId } }),
      prisma.calendarEvent.findMany({ where: { userId } }),
      prisma.linkedGoogleCalendar.findMany({ where: { userId } }),
      prisma.pomodoroSession.findMany({ where: { userId } }),
      prisma.pendingSync.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.event.findMany({ where: { userId }, orderBy: { occurredAt: "asc" } }),
      prisma.timetableEntry.findMany({ where: { userId }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    ]);
  if (!user) throw ApiError.notFound("User not found");

  return {
    app: SNAPSHOT_APP,
    type: "data-export" as const,
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      attendanceAutoMarkHours: user.attendanceAutoMarkHours,
      pomodoroWorkMinutes: user.pomodoroWorkMinutes,
      pomodoroBreakMinutes: user.pomodoroBreakMinutes,
      chimeOnTheHour: user.chimeOnTheHour,
      onboardingComplete: user.onboardingComplete,
    },
    tasks: tasks.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      completedAt: iso(t.completedAt),
      deletedAt: iso(t.deletedAt),
    })),
    courses: courses.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    // Dated timetable exceptions travel with the courses they qualify.
    timetableEntries: timetableEntries.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
    attendanceRecords: attendance.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      confirmedAt: iso(a.confirmedAt),
    })),
    calendarEvents: calendarEvents.map((e) => ({
      ...e,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      googleUpdatedAt: iso(e.googleUpdatedAt),
    })),
    linkedGoogleCalendars: linkedCalendars.map((l) => ({ ...l })),
    pomodoroSessions: pomodoro.map((p) => ({
      ...p,
      startedAt: p.startedAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    })),
    pendingSync: pendingSyncRows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      appliedAt: iso(r.appliedAt),
    })),
    events: events.map((e) => ({ ...e, occurredAt: e.occurredAt.toISOString() })),
  };
}

export type Snapshot = Awaited<ReturnType<typeof collectSnapshot>>;

// --------------- Health ---------------

router.get("/", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [tasks, courses, attendance, calendarEvents, pomodoro, events, pending] = await Promise.all([
      prisma.task.count({ where: { userId } }),
      prisma.course.count({ where: { userId } }),
      prisma.attendanceRecord.count({ where: { userId } }),
      prisma.calendarEvent.count({ where: { userId } }),
      prisma.pomodoroSession.count({ where: { userId } }),
      prisma.event.count({ where: { userId } }),
      prisma.pendingSync.groupBy({ by: ["status"], where: { userId }, _count: true }),
    ]);

    const pendingSync = { pending: 0, applied: 0, failed: 0 };
    for (const row of pending) {
      const k = row.status.toLowerCase();
      if (k in pendingSync) pendingSync[k as keyof typeof pendingSync] = row._count;
    }

    res.json({
      ok: true,
      data: {
        serverTime: new Date().toISOString(),
        counts: {
          tasks,
          courses,
          attendanceRecords: attendance,
          calendarEvents,
          pomodoroSessions: pomodoro,
          events,
        },
        pendingSync,
      },
    });
  } catch (err) {
    next(err);
  }
});

// --------------- Export / backup ---------------

router.get("/export", async (req, res, next) => {
  try {
    const snapshot = await collectSnapshot(req.user.id);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="export-${stamp}.snapshot.json"`);
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

router.post("/backup", async (req, res, next) => {
  try {
    const snapshot = await collectSnapshot(req.user.id);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${req.user.id.slice(0, 8)}-${stamp}${SNAPSHOT_EXT}`;
    const filePath = path.join(snapshotsDir(), filename);
    await fs.promises.writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
    res.status(201).json({ ok: true, data: { file: filename, exportedAt: snapshot.exportedAt } });
  } catch (err) {
    next(err);
  }
});

router.get("/backups", async (req, res, next) => {
  try {
    const dir = snapshotsDir();
    const entries = await fs.promises.readdir(dir);
    const meta = await Promise.all(
      entries
        .filter((f) => f.endsWith(SNAPSHOT_EXT))
        .map(async (f) => {
          const st = await fs.promises.stat(path.join(dir, f));
          return { name: f, size: st.size, modifiedAt: st.mtime.toISOString() };
        }),
    );
    meta.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    res.json({ ok: true, data: meta });
  } catch (err) {
    next(err);
  }
});

// Download a server-side snapshot file (name is validated to stay inside the
// snapshots dir — never accept arbitrary paths).
router.get("/backup/file", async (req, res, next) => {
  try {
    const name = (req.query.name as string) ?? "";
    if (!/^[A-Za-z0-9._-]+$/.test(name) || !name.endsWith(SNAPSHOT_EXT)) {
      throw ApiError.badRequest("Invalid backup file name.");
    }
    const filePath = path.resolve(snapshotsDir(), name);
    if (!filePath.startsWith(path.resolve(snapshotsDir()))) {
      throw ApiError.badRequest("Invalid backup file path.");
    }
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      throw ApiError.notFound("Backup file not found.");
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

// --------------- Restore (validated, transactional, pre-restore backup) ---------------

function fail(message: string): never {
  throw ApiError.badRequest(message);
}

interface Slot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

function validSlot(s: unknown): s is Slot {
  if (typeof s !== "object" || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.dayOfWeek === "number" &&
    Number.isInteger(o.dayOfWeek) &&
    o.dayOfWeek >= 0 &&
    o.dayOfWeek <= 6 &&
    typeof o.startTime === "string" &&
    HM.test(o.startTime) &&
    typeof o.endTime === "string" &&
    HM.test(o.endTime)
  );
}

interface NormalizedSnapshot {
  /**
   * Optional: snapshots taken before timetable entries existed have none, and
   * must still restore cleanly.
   */
  timetableEntries?: Array<{
    id: string;
    courseId: string | null;
    title: string;
    kind: TimetableEntryKind;
    date: string;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    notes: string | null;
    replacesSlot: unknown;
  }>;
  courses: Array<{
    id: string;
    name: string;
    code: string | null;
    schedule: Slot[];
    attendanceThreshold: number;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    notes: string | null;
    dueDate: string | null;
    dueTime: string | null;
    completed: boolean;
    completedAt: string | null;
    deletedAt: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH";
    recurrenceRule: string | null;
    lastCompletedOccurrence: string | null;
    courseId: string | null;
  }>;
  attendanceRecords: Array<{
    id: string;
    courseId: string;
    date: string;
    status: "ATTENDED" | "MISSED" | "CANCELLED" | "UNCONFIRMED";
    confirmedAt: string | null;
  }>;
  calendarEvents: Array<{
    id: string;
    source: "LOCAL" | "GOOGLE";
    googleEventId: string | null;
    sourceCalendarId: string | null;
    title: string;
    description: string | null;
    startTime: string;
    endTime: string;
    allDay: boolean;
    location: string | null;
    color: string | null;
    isDedupedDuplicate: boolean;
    isDeleted: boolean;
    googleUpdatedAt: string | null;
  }>;
  linkedGoogleCalendars: Array<{ id: string; summary: string; backgroundColor: string | null; accessRole: string | null; isLinked: boolean }>;
  pomodoroSessions: Array<{ id: string; taskId: string | null; startedAt: string; durationMinutes: number; completed: boolean }>;
  pendingSync: Array<{ id: string; actionType: string; payload: unknown; idempotencyKey: string; status: string; error: string | null }>;
  events: Array<{ id: string; type: string; occurredAt: string; payload: unknown }>;
}

function normalizeSnapshot(body: unknown): NormalizedSnapshot {
  if (typeof body !== "object" || body === null) fail("Body must be a JSON object.");
  const b = body as Record<string, unknown>;
  if (b.app !== SNAPSHOT_APP) fail("Not a That Productivity App snapshot.");
  if (b.type !== "data-export") fail("Not a data-export snapshot.");
  if (b.version !== SNAPSHOT_VERSION) fail(`Unsupported snapshot version: ${JSON.stringify(b.version)}.`);

  const arr = (name: string): unknown[] => {
    const v = b[name];
    if (!Array.isArray(v)) fail(`Snapshot is missing the "${name}" collection.`);
    return v;
  };

  const strOrNull = (o: Record<string, unknown>, k: string, ctx: string): string | null => {
    const v = o[k];
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") fail(`Invalid "${k}" in ${ctx}.`);
    return v;
  };

  const boolOr = (o: Record<string, unknown>, k: string, fallback: boolean, ctx: string): boolean => {
    const v = o[k];
    if (typeof v === "boolean") return v;
    if (v === undefined) return fallback;
    fail(`Invalid "${k}" in ${ctx}.`);
  };

  const isoDate = (o: Record<string, unknown>, k: string, ctx: string): string | null => {
    const v = strOrNull(o, k, ctx);
    if (v === null) return null;
    if (Number.isNaN(new Date(v).getTime())) fail(`Invalid "${k}" in ${ctx}.`);
    return v;
  };

  const courses: NormalizedSnapshot["courses"] = arr("courses").map((raw) => {
    if (typeof raw !== "object" || raw === null) fail("Invalid course entry.");
    const o = raw as Record<string, unknown>;
    const id = strOrNull(o, "id", "courses") ?? fail(`Course missing "id".`);
    const name = typeof o.name === "string" && o.name.length > 0 ? o.name : fail(`Course "${id}" missing a name.`);
    const schedule = Array.isArray(o.schedule) ? o.schedule : [];
    if (!schedule.every(validSlot)) fail(`Course "${id}" has an invalid schedule slot (expected {dayOfWeek, startTime, endTime}).`);
    const threshold = typeof o.attendanceThreshold === "number" ? Math.round(o.attendanceThreshold) : 80;
    return {
      id,
      name,
      code: strOrNull(o, "code", `course ${id}`),
      schedule,
      attendanceThreshold: Math.min(100, Math.max(0, threshold)),
    };
  });

  const courseIds = new Set(courses.map((c) => c.id));

  // Timetable entries are optional, and are validated on the way in rather than
  // trusted: a `courseId` that is not in this snapshot would attach the entry to
  // somebody else's course, and the timetable reads a course name back out of
  // that link. An unknown kind is not fatal either, since this column is
  // extended over time; it falls back to EVENT.
  const timetableEntries: NormalizedSnapshot["timetableEntries"] = b.timetableEntries === undefined
    ? undefined
    : (Array.isArray(b.timetableEntries) ? b.timetableEntries : fail('"timetableEntries" must be an array.')).map((raw) => {
        if (typeof raw !== "object" || raw === null) fail("Invalid timetable entry.");
        const o = raw as Record<string, unknown>;
        const id = strOrNull(o, "id", "timetableEntries") ?? fail('Timetable entry missing "id".');
        const title = typeof o.title === "string" && o.title.length > 0
          ? o.title
          : fail(`Timetable entry "${id}" missing a title.`);
        const date = strOrNull(o, "date", `timetable entry ${id}`);
        if (date === null || !YMD.test(date)) fail(`Timetable entry "${id}" has an invalid date.`);
        const kind = typeof o.kind === "string" && isTimetableEntryKind(o.kind) ? o.kind : "EVENT";
        const startTime = strOrNull(o, "startTime", `timetable entry ${id}`);
        const endTime = strOrNull(o, "endTime", `timetable entry ${id}`);
        if (startTime !== null && !HM.test(startTime)) fail(`Timetable entry "${id}" has an invalid startTime.`);
        if (endTime !== null && !HM.test(endTime)) fail(`Timetable entry "${id}" has an invalid endTime.`);
        if (startTime !== null && endTime !== null && endTime <= startTime) {
          fail(`Timetable entry "${id}" ends before it starts.`);
        }
        const courseId = strOrNull(o, "courseId", `timetable entry ${id}`);
        if (courseId !== null && !courseIds.has(courseId)) {
          fail(`Timetable entry "${id}" references unknown course "${courseId}".`);
        }
        let replacesSlot: { dayOfWeek: number; startTime: string; endTime: string } | null = null;
        if (o.replacesSlot !== null && o.replacesSlot !== undefined) {
          if (!validSlot(o.replacesSlot)) fail(`Timetable entry "${id}" has an invalid replacesSlot.`);
          const r = o.replacesSlot as unknown as Record<string, unknown>;
          replacesSlot = {
            dayOfWeek: r.dayOfWeek as number,
            startTime: r.startTime as string,
            endTime: r.endTime as string,
          };
        }
        return {
          id,
          courseId,
          title,
          kind,
          date,
          startTime,
          endTime,
          location: strOrNull(o, "location", `timetable entry ${id}`),
          notes: strOrNull(o, "notes", `timetable entry ${id}`),
          replacesSlot,
        };
      });

  const tasks: NormalizedSnapshot["tasks"] = arr("tasks").map((raw) => {
    if (typeof raw !== "object" || raw === null) fail("Invalid task entry.");
    const o = raw as Record<string, unknown>;
    const id = strOrNull(o, "id", "tasks") ?? fail(`Task missing "id".`);
    const courseId = strOrNull(o, "courseId", `task ${id}`);
    if (courseId !== null && !courseIds.has(courseId)) fail(`Task "${id}" references unknown course "${courseId}".`);
    const due = strOrNull(o, "dueDate", `task ${id}`);
    const t = strOrNull(o, "dueTime", `task ${id}`);
    if (due !== null && !YMD.test(due)) fail(`Task "${id}" has invalid dueDate.`);
    if (t !== null && !HM.test(t)) fail(`Task "${id}" has invalid dueTime.`);
    const priority = o.priority;
    if (priority !== "LOW" && priority !== "MEDIUM" && priority !== "HIGH") fail(`Task "${id}" has invalid priority.`);
    return {
      id,
      title: typeof o.title === "string" && o.title.length > 0 ? o.title : fail(`Task "${id}" missing a title.`),
      notes: strOrNull(o, "notes", `task ${id}`),
      dueDate: due,
      dueTime: t,
      completed: boolOr(o, "completed", false, `task ${id}`),
      completedAt: isoDate(o, "completedAt", `task ${id}`),
      deletedAt: isoDate(o, "deletedAt", `task ${id}`),
      priority,
      recurrenceRule: strOrNull(o, "recurrenceRule", `task ${id}`),
      lastCompletedOccurrence: strOrNull(o, "lastCompletedOccurrence", `task ${id}`),
      courseId,
    };
  });

  const taskIds = new Set(tasks.map((t) => t.id));

  const attendanceRecords: NormalizedSnapshot["attendanceRecords"] = arr("attendanceRecords").map((raw) => {
    if (typeof raw !== "object" || raw === null) fail("Invalid attendance record.");
    const o = raw as Record<string, unknown>;
    const id = strOrNull(o, "id", "attendance") ?? fail(`Attendance record missing "id".`);
    const courseId = strOrNull(o, "courseId", `attendance record ${id}`) ?? fail(`Attendance record "${id}" missing courseId.`);
    if (!courseIds.has(courseId)) fail(`Attendance record "${id}" references unknown course "${courseId}".`);
    const date = strOrNull(o, "date", `attendance record ${id}`) ?? fail(`Attendance record "${id}" missing date.`);
    if (!YMD.test(date)) fail(`Attendance record "${id}" has invalid date.`);
    const status = o.status;
    if (typeof status !== "string" || !ATTENDANCE_STATUSES.has(status)) fail(`Attendance record "${id}" has invalid status.`);
    return {
      id,
      courseId,
      date,
      status: status as NormalizedSnapshot["attendanceRecords"][number]["status"],
      confirmedAt: isoDate(o, "confirmedAt", `attendance record ${id}`),
    };
  });

  const calendarEvents: NormalizedSnapshot["calendarEvents"] = arr("calendarEvents").map((raw) => {
    if (typeof raw !== "object" || raw === null) fail("Invalid calendar event.");
    const o = raw as Record<string, unknown>;
    const id = strOrNull(o, "id", "calendarEvents") ?? fail(`Calendar event missing "id".`);
    const start = isoDate(o, "startTime", `event ${id}`) ?? fail(`Event "${id}" missing startTime.`);
    const end = isoDate(o, "endTime", `event ${id}`) ?? fail(`Event "${id}" missing endTime.`);
    if (new Date(end).getTime() <= new Date(start).getTime()) fail(`Event "${id}" ends before it starts.`);
    const source = o.source;
    if (typeof source !== "string" || !CALENDAR_SOURCES.has(source)) fail(`Event "${id}" has invalid source.`);
    return {
      id,
      source: source as "LOCAL" | "GOOGLE",
      googleEventId: strOrNull(o, "googleEventId", `event ${id}`),
      sourceCalendarId: strOrNull(o, "sourceCalendarId", `event ${id}`),
      title: typeof o.title === "string" && o.title.length > 0 ? o.title : fail(`Event "${id}" missing a title.`),
      description: strOrNull(o, "description", `event ${id}`),
      startTime: start,
      endTime: end,
      allDay: boolOr(o, "allDay", false, `event ${id}`),
      location: strOrNull(o, "location", `event ${id}`),
      color: strOrNull(o, "color", `event ${id}`),
      isDedupedDuplicate: boolOr(o, "isDedupedDuplicate", false, `event ${id}`),
      isDeleted: boolOr(o, "isDeleted", false, `event ${id}`),
      googleUpdatedAt: isoDate(o, "googleUpdatedAt", `event ${id}`),
    };
  });

  const linkedGoogleCalendars: NormalizedSnapshot["linkedGoogleCalendars"] = arr("linkedGoogleCalendars").map((raw) => {
    if (typeof raw !== "object" || raw === null) fail("Invalid linked calendar.");
    const o = raw as Record<string, unknown>;
    const id = strOrNull(o, "id", "linkedGoogleCalendars") ?? fail("Linked calendar missing id.");
    return {
      id,
      summary: typeof o.summary === "string" ? o.summary : fail(`Linked calendar "${id}" missing summary.`),
      backgroundColor: strOrNull(o, "backgroundColor", `linked calendar ${id}`),
      accessRole: strOrNull(o, "accessRole", `linked calendar ${id}`),
      isLinked: boolOr(o, "isLinked", true, `linked calendar ${id}`),
    };
  });

  const pomodoroSessions: NormalizedSnapshot["pomodoroSessions"] = arr("pomodoroSessions").map((raw) => {
    if (typeof raw !== "object" || raw === null) fail("Invalid pomodoro session.");
    const o = raw as Record<string, unknown>;
    const id = strOrNull(o, "id", "pomodoroSessions") ?? fail("Pomodoro session missing id.");
    const taskId = strOrNull(o, "taskId", `pomodoro session ${id}`);
    if (taskId !== null && !taskIds.has(taskId)) fail(`Pomodoro session "${id}" references unknown task "${taskId}".`);
    return {
      id,
      taskId,
      startedAt: isoDate(o, "startedAt", `pomodoro session ${id}`) ?? fail(`Pomodoro session "${id}" missing startedAt.`),
      durationMinutes: typeof o.durationMinutes === "number" ? Math.max(1, Math.round(o.durationMinutes)) : fail(`Pomodoro session "${id}" has invalid durationMinutes.`),
      completed: boolOr(o, "completed", true, `pomodoro session ${id}`),
    };
  });

  const pendingSync: NormalizedSnapshot["pendingSync"] = arr("pendingSync").map((raw) => {
    if (typeof raw !== "object" || raw === null) fail("Invalid pending sync entry.");
    const o = raw as Record<string, unknown>;
    const id = strOrNull(o, "id", "pendingSync") ?? fail("Pending sync entry missing id.");
    const idempotencyKey = strOrNull(o, "idempotencyKey", `pendingSync ${id}`) ?? fail(`Pending sync "${id}" missing idempotencyKey.`);
    const status = o.status;
    if (typeof status !== "string" || !PENDING_STATUSES.has(status)) fail(`Pending sync "${id}" has invalid status.`);
    return {
      id,
      actionType: typeof o.actionType === "string" ? o.actionType : fail(`Pending sync "${id}" missing actionType.`),
      payload: o.payload,
      idempotencyKey,
      status,
      error: strOrNull(o, "error", `pendingSync ${id}`),
    };
  });

  const events: NormalizedSnapshot["events"] = arr("events").map((raw) => {
    if (typeof raw !== "object" || raw === null) fail("Invalid event entry.");
    const o = raw as Record<string, unknown>;
    const id = strOrNull(o, "id", "events") ?? fail("Event missing id.");
    const type = o.type;
    if (typeof type !== "string" || !EVENT_TYPES.has(type)) fail(`Event "${id}" has invalid type.`);
    return {
      id,
      type,
      occurredAt: isoDate(o, "occurredAt", `event ${id}`) ?? fail(`Event "${id}" missing occurredAt.`),
      payload: o.payload,
    };
  });

  return {
    courses,
    tasks,
    attendanceRecords,
    calendarEvents,
    linkedGoogleCalendars,
    pomodoroSessions,
    pendingSync,
    events,
  };
}

router.post("/restore", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const data = normalizeSnapshot(req.body);

    // Safety net: capture the current state BEFORE touching anything. If this
    // write fails, we abort with the database untouched.
    const pre = await collectSnapshot(userId);
    const preId = new Date().toISOString().replace(/[:.]/g, "-");
    const preFile = `pre-restore-${userId.slice(0, 8)}-${preId}${SNAPSHOT_EXT}`;
    await fs.promises.writeFile(path.join(snapshotsDir(), preFile), JSON.stringify(pre, null, 2), "utf8");

const now = new Date().toISOString();

    const ops = [
      prisma.attendanceRecord.deleteMany({ where: { userId } }),
      prisma.task.deleteMany({ where: { userId } }),
      // Entries reference courses, so they go first or the FK blocks the wipe.
      prisma.timetableEntry.deleteMany({ where: { userId } }),
      prisma.course.deleteMany({ where: { userId } }),
      prisma.event.deleteMany({ where: { userId } }),
      prisma.pendingSync.deleteMany({ where: { userId } }),
      prisma.pomodoroSession.deleteMany({ where: { userId } }),
      prisma.calendarEvent.deleteMany({ where: { userId } }),
      prisma.linkedGoogleCalendar.deleteMany({ where: { userId } }),
    ];

    if (data.courses.length) {
      ops.push(
        prisma.course.createMany({
          data: data.courses.map((c) => ({
            id: c.id,
            userId,
            name: c.name,
            code: c.code,
            schedule: c.schedule as unknown as Prisma.InputJsonValue,
            attendanceThreshold: c.attendanceThreshold,
            createdAt: now,
            updatedAt: now,
          })),
        }),
      );
    }
    if (data.timetableEntries?.length) {
      ops.push(
        prisma.timetableEntry.createMany({
          data: data.timetableEntries.map((e) => ({
            id: e.id,
            userId,
            courseId: e.courseId,
            title: e.title,
            kind: e.kind,
            date: e.date,
            startTime: e.startTime,
            endTime: e.endTime,
            location: e.location,
            notes: e.notes,
            replacesSlot: (e.replacesSlot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            createdAt: now,
            updatedAt: now,
          })),
        }),
      );
    }
    if (data.tasks.length) {
      ops.push(
        prisma.task.createMany({
          data: data.tasks.map((t) => ({
            id: t.id,
            userId,
            title: t.title,
            notes: t.notes,
            dueDate: t.dueDate,
            dueTime: t.dueTime,
            completed: t.completed,
            completedAt: t.completedAt,
            deletedAt: t.deletedAt,
            priority: t.priority,
            recurrenceRule: t.recurrenceRule,
            lastCompletedOccurrence: t.lastCompletedOccurrence,
            courseId: t.courseId,
            createdAt: now,
            updatedAt: now,
          })),
        }),
      );
    }
    if (data.attendanceRecords.length) {
      ops.push(
        prisma.attendanceRecord.createMany({
          data: data.attendanceRecords.map((a) => ({
            id: a.id,
            userId,
            courseId: a.courseId,
            date: a.date,
            status: a.status,
            confirmedAt: a.confirmedAt,
            createdAt: now,
            updatedAt: now,
          })),
        }),
      );
    }
    if (data.calendarEvents.length) {
      ops.push(
        prisma.calendarEvent.createMany({
          data: data.calendarEvents.map((e) => ({
            id: e.id,
            userId,
            source: e.source,
            googleEventId: e.googleEventId,
            sourceCalendarId: e.sourceCalendarId,
            title: e.title,
            description: e.description,
            startTime: e.startTime,
            endTime: e.endTime,
            allDay: e.allDay,
            location: e.location,
            color: e.color,
            isDedupedDuplicate: e.isDedupedDuplicate,
            isDeleted: e.isDeleted,
            googleUpdatedAt: e.googleUpdatedAt,
            createdAt: now,
            updatedAt: now,
          })),
        }),
      );
    }
    // Calendar links are deliberately NOT restored. A link now belongs to a
    // Google account, and a snapshot carries no OAuth tokens, so there is
    // nothing to attach one to. Re-creating the rows would produce calendars
    // that can never sync and that block the `connectionId` foreign key. The
    // user re-links their Google accounts and the calendars come back from
    // Google; only the synced events themselves are restored above.
    void data.linkedGoogleCalendars;
    if (data.pomodoroSessions.length) {
      ops.push(
        prisma.pomodoroSession.createMany({
          data: data.pomodoroSessions.map((p) => ({
            id: p.id,
            userId,
            taskId: p.taskId,
            startedAt: p.startedAt,
            durationMinutes: p.durationMinutes,
            completed: p.completed,
            createdAt: now,
          })),
        }),
      );
    }
    if (data.pendingSync.length) {
      ops.push(
        prisma.pendingSync.createMany({
          data: data.pendingSync.map((p) => ({
            id: p.id,
            userId,
            actionType: p.actionType,
            payload: p.payload as Prisma.InputJsonValue,
            idempotencyKey: p.idempotencyKey,
            status: p.status,
            error: p.error,
            createdAt: now,
            appliedAt: p.status === "APPLIED" ? now : null,
          })),
        }),
      );
    }
    if (data.events.length) {
      ops.push(
        prisma.event.createMany({
          data: data.events.map((e) => ({
            id: e.id,
            userId,
            type: e.type as EventType,
            occurredAt: e.occurredAt,
            payload: e.payload as Prisma.InputJsonValue,
          })),
        }),
      );
    }

    const DELETE_OPS = 8;

    const results = await prisma.$transaction(ops);

    const countKeys = ["attendanceRecords", "tasks", "courses", "events", "pendingSync", "pomodoroSessions", "calendarEvents", "linkedGoogleCalendars"] as const;
    const counts: Record<string, number> = {};
    results.slice(DELETE_OPS).forEach((r, i) => {
      counts[countKeys[i]] = r.count;
    });

    res.json({
      ok: true,
      data: { preRestoreBackup: preFile, restoredAt: now, counts },
    });
  } catch (err) {
    next(err);
  }
});

export default router;