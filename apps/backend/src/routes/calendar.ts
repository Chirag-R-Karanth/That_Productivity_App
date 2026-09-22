import { Router } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { ApiError } from "../lib/errors.js";
import { recordEvent } from "../services/events.js";
import { EventType } from "../generated/prisma/enums.js";
import type { CalendarEvent } from "@prodapp/shared-types";
import {
  ensureAccessToken,
  gcalColor,
  getEvents,
  googleConfigured,
  listCalendars,
} from "../services/google.js";

const router: RouterType = Router();
router.use(requireAuth);
router.use(idempotency);

const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid datetime" });

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  startTime: isoDateTime,
  endTime: isoDateTime,
  allDay: z.boolean().optional(),
  location: z.string().max(500).nullable().optional(),
  color: z.string().max(50).nullable().optional(),
});

const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  startTime: isoDateTime.optional(),
  endTime: isoDateTime.optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(500).nullable().optional(),
  color: z.string().max(50).nullable().optional(),
});

function toPublicEvent(e: {
  id: string;
  userId: string;
  source: "LOCAL" | "GOOGLE";
  googleEventId: string | null;
  sourceCalendarId: string | null;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  location: string | null;
  color: string | null;
  isDedupedDuplicate: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CalendarEvent {
  return {
    id: e.id,
    userId: e.userId,
    source: e.source,
    sourceCalendarId: e.sourceCalendarId,
    title: e.title,
    description: e.description,
    startTime: e.startTime.toISOString(),
    endTime: e.endTime.toISOString(),
    allDay: e.allDay,
    location: e.location,
    color: e.color,
    isDedupedDuplicate: e.isDedupedDuplicate,
    isDeleted: e.isDeleted,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

// List events in a date range (inclusive). Returns non-deleted events only.
router.get("/", async (req, res, next) => {
  try {
    const fromParam = (req.query.from as string) ?? new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const toParam = (req.query.to as string) ?? new Date(new Date().setHours(23, 59, 59, 999)).toISOString();
    const from = new Date(fromParam);
    const to = new Date(toParam);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw ApiError.badRequest("Invalid date range");
    }

    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: req.user.id,
        isDeleted: false,
        isDedupedDuplicate: false,
        OR: [{ startTime: { lte: to } }, { endTime: { gte: from } }],
      },
      orderBy: [{ startTime: "asc" }],
    });

    // Only return events that overlap the window
    const overlapping = events.filter((e) => e.startTime <= to && e.endTime >= from);
    res.json({ ok: true, data: overlapping.map(toPublicEvent) });
  } catch (err) {
    next(err);
  }
});

// Create a local event (or client-imported GOOGLE event)
router.post("/", async (req, res, next) => {
  try {
    const body = createEventSchema.parse(req.body);
    if (new Date(body.endTime) <= new Date(body.startTime)) {
      throw ApiError.badRequest("endTime must be after startTime");
    }

    const event = await prisma.calendarEvent.create({
      data: {
        userId: req.user.id,
        source: "LOCAL",
        title: body.title,
        description: body.description ?? null,
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
        allDay: body.allDay ?? false,
        location: body.location ?? null,
        color: body.color ?? null,
      },
    });

    res.status(201).json({ ok: true, data: toPublicEvent(event) });
    recordEvent(req.user.id, EventType.CALENDAR_EVENT_SYNCED, {
      eventId: event.id,
      title: event.title,
      source: event.source,
    });
  } catch (err) {
    next(err);
  }
});

// Update event
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = updateEventSchema.parse(req.body);

    const existing = await prisma.calendarEvent.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) throw ApiError.notFound("Event not found");

    if (body.startTime || body.endTime) {
      const start = body.startTime ? new Date(body.startTime) : existing.startTime;
      const end = body.endTime ? new Date(body.endTime) : existing.endTime;
      if (end <= start) throw ApiError.badRequest("endTime must be after startTime");
    }

    const event = await prisma.calendarEvent.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        startTime: body.startTime ? new Date(body.startTime) : undefined,
        endTime: body.endTime ? new Date(body.endTime) : undefined,
        allDay: body.allDay,
        location: body.location,
        color: body.color,
      },
    });

    res.json({ ok: true, data: toPublicEvent(event) });
    recordEvent(req.user.id, EventType.CALENDAR_EVENT_UPDATED, {
      eventId: event.id,
      title: event.title,
      source: event.source,
    });
  } catch (err) {
    next(err);
  }
});

// Soft-delete event
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.calendarEvent.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) throw ApiError.notFound("Event not found");

    await prisma.calendarEvent.update({
      where: { id },
      data: { isDeleted: true },
    });

    res.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

// ---------- Google Calendar connections ----------

// List linked calendars
router.get("/google/calendars", async (req, res, next) => {
  try {
    const rows = await prisma.linkedGoogleCalendar.findMany({
      where: { userId: req.user.id, isLinked: true },
      orderBy: { summary: "asc" },
    });
    res.json({
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        summary: r.summary,
        backgroundColor: r.backgroundColor,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Unlink a calendar (stops syncing and hides its events)
router.delete("/google/calendars/:calendarId", async (req, res, next) => {
  try {
    const { calendarId } = req.params;
    const existing = await prisma.linkedGoogleCalendar.findFirst({
      where: { userId: req.user.id, id: calendarId },
    });
    if (!existing) throw ApiError.notFound("Calendar not linked");

    await prisma.$transaction([
      prisma.linkedGoogleCalendar.update({
        where: { id: existing.id },
        data: { isLinked: false },
      }),
      prisma.calendarEvent.updateMany({
        where: { userId: req.user.id, source: "GOOGLE", sourceCalendarId: existing.id },
        data: { isDeleted: true },
      }),
    ]);

    res.json({ ok: true, data: { unlinked: true } });
  } catch (err) {
    next(err);
  }
});

// Pull the latest events from every linked calendar
router.post("/google/sync", async (req, res, next) => {
  try {
    if (!googleConfigured()) {
      throw ApiError.badRequest("Google Calendar is not configured on this server.");
    }
    const userId = req.user.id;
    const userRow = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    let accessToken: string;
    try {
      accessToken = await ensureAccessToken(userRow, (data) =>
        prisma.user.update({ where: { id: userId }, data }),
      );
    } catch (err) {
      if (err instanceof Error && err.message === "No Google refresh token stored") {
        throw ApiError.badRequest("No linked Google Calendar.");
      }
      throw err;
    }

    const list = await listCalendars(accessToken);
    const present = (list.items ?? []).map((i) => i.id);

    // Keep the stored calendar list in sync with the Google account.
    for (const item of list.items ?? []) {
      await prisma.linkedGoogleCalendar.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          userId,
          summary: item.summary,
          backgroundColor: item.backgroundColor ?? null,
          accessRole: item.accessRole ?? null,
        },
        update: { isLinked: true },
      });
    }
    await prisma.linkedGoogleCalendar.updateMany({
      where: { userId, isLinked: true, id: { notIn: present } },
      data: { isLinked: false },
    });

    const linked = await prisma.linkedGoogleCalendar.findMany({
      where: { userId, isLinked: true },
    });
    if (linked.length === 0) {
      throw ApiError.badRequest("No linked calendars to sync");
    }

    const now = Date.now();
    const timeMin = new Date(now - 180 * 86_400_000).toISOString();
    const timeMax = new Date(now + 365 * 86_400_000).toISOString();

    let eventsAdded = 0;
    let eventsUpdated = 0;
    let eventsDeleted = 0;
    let mergedDuplicates = 0;
    const seen = new Set<string>();

    for (const cal of linked) {
      const remote = await getEvents(accessToken, cal.id, timeMin, timeMax);
      const remoteItems = remote.items ?? [];

      const stored = await prisma.calendarEvent.findMany({
        where: { userId, source: "GOOGLE", sourceCalendarId: cal.id, isDeleted: false },
        select: { id: true, googleEventId: true },
      });
      const storedById = new Map(stored.map((e) => [e.googleEventId, e.id]));
      const remoteIds = new Set<string>();

      for (const item of remoteItems) {
        if (item.status === "cancelled") continue;
        const googleEventId = item.id;
        remoteIds.add(googleEventId);

        const isDuplicate = seen.has(googleEventId);
        seen.add(googleEventId);

        const title = (item.summary ?? "").trim() || "(Untitled)";
        const allDay = !item.start?.dateTime;
        const startIso = allDay
          ? `${item.start?.date}T00:00:00`
          : item.start?.dateTime;
        const endIso = allDay
          ? `${item.end?.date ?? item.start?.date}T23:59:59`
          : item.end?.dateTime;
        if (!startIso || !endIso) continue;

        const startTime = new Date(startIso);
        const endTime = new Date(endIso);
        if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) continue;

        const color = gcalColor(item.colorId);
        const data = {
          userId,
          source: "GOOGLE" as const,
          googleEventId,
          sourceCalendarId: cal.id,
          title,
          description: item.description ?? null,
          startTime,
          endTime,
          allDay,
          location: item.location ?? null,
          color,
          isDedupedDuplicate: isDuplicate,
          isDeleted: false,
          googleUpdatedAt: new Date(),
        };

        const existed = storedById.get(googleEventId);
        if (existed) {
          await prisma.calendarEvent.update({ where: { id: existed }, data });
          if (isDuplicate) mergedDuplicates += 1;
          else eventsUpdated += 1;
        } else {
          await prisma.calendarEvent.create({ data });
          if (isDuplicate) mergedDuplicates += 1;
          else eventsAdded += 1;
        }
      }

      // Remote deletions: previously stored events now missing from a sync.
      const toHide = stored.filter((e) => !remoteIds.has(e.googleEventId!));
      if (toHide.length > 0) {
        await prisma.calendarEvent.updateMany({
          where: { id: { in: toHide.map((e) => e.id) } },
          data: { isDeleted: true },
        });
        eventsDeleted += toHide.length;
      }
    }

    res.json({
      ok: true,
      data: {
        eventsAdded,
        eventsUpdated,
        eventsDeleted,
        mergedDuplicates,
      },
    });
    recordEvent(req.user.id, EventType.CALENDAR_EVENT_SYNCED, {
      source: "GOOGLE",
      eventsAdded,
      eventsUpdated,
      eventsDeleted,
      mergedDuplicates,
    });
  } catch (err) {
    next(err);
  }
});

export default router;