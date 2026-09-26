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
  gcalColor,
  getEvents,
  googleConfigured,
  type GoogleCalendarEventItem,
} from "../services/google.js";
import {
  accessTokenFor,
  activeConnections,
  describe,
  syncConnectionCalendars,
} from "../services/googleConnections.js";
import { eventFingerprint } from "../services/calendarDedup.js";

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
      // Grouped by account, so a user with several Google accounts can tell
      // which of them a calendar belongs to.
      include: { connection: { select: { email: true, displayName: true } } },
      orderBy: [{ connection: { createdAt: "asc" } }, { summary: "asc" }],
    });
    res.json({
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        summary: r.summary,
        backgroundColor: r.backgroundColor,
        includeInDay: r.includeInDay,
        // Needed to address this calendar: the same id can exist under more
        // than one linked account.
        connectionId: r.connectionId,
        accountEmail: r.connection.email,
        accountName: r.connection.displayName,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Choose whether a linked calendar counts as planned time.
//
// Separate from unlinking on purpose: a calendar that is merely clutter can
// still be synced (so it shows up in Review and in search) without eating
// capacity in the day model.
router.patch("/google/connections/:connectionId/calendars/:calendarId", async (req, res, next) => {
  try {
    const { connectionId, calendarId } = req.params;
    const existing = await prisma.linkedGoogleCalendar.findFirst({
      where: {
        userId: req.user.id,
        connectionId: String(connectionId),
        id: String(calendarId),
      },
    });
    if (!existing) throw ApiError.notFound("Calendar not linked");

    const body = req.body as { includeInDay?: unknown };
    if (typeof body.includeInDay !== "boolean") {
      throw ApiError.badRequest("includeInDay must be a boolean");
    }

    const updated = await prisma.linkedGoogleCalendar.update({
      where: { connectionId_id: { connectionId: existing.connectionId, id: existing.id } },
      data: { includeInDay: body.includeInDay },
    });
    res.json({
      ok: true,
      data: {
        id: updated.id,
        summary: updated.summary,
        backgroundColor: updated.backgroundColor,
        includeInDay: updated.includeInDay,
        connectionId: updated.connectionId,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Unlink one calendar of one account (stops syncing it and hides its events).
//
// The account is part of the path because a calendar id is only unique within
// its account: with several Google accounts linked, `primary` exists once per
// account and a bare calendar id cannot say which one is meant.
router.delete("/google/connections/:connectionId/calendars/:calendarId", async (req, res, next) => {
  try {
    const { connectionId, calendarId } = req.params;
    const existing = await prisma.linkedGoogleCalendar.findFirst({
      where: { userId: req.user.id, connectionId: String(connectionId), id: String(calendarId) },
    });
    if (!existing) throw ApiError.notFound("Calendar not linked");

    await prisma.$transaction([
      prisma.linkedGoogleCalendar.update({
        where: { connectionId_id: { connectionId: existing.connectionId, id: existing.id } },
        data: { isLinked: false },
      }),
      // Scoped to the connection too, for the same reason.
      prisma.calendarEvent.updateMany({
        where: {
          userId: req.user.id,
          source: "GOOGLE",
          connectionId: existing.connectionId,
          sourceCalendarId: existing.id,
        },
        data: { isDeleted: true },
      }),
    ]);

    res.json({ ok: true, data: { unlinked: true } });
  } catch (err) {
    next(err);
  }
});

// Pull the latest events from every linked calendar of every linked account
router.post("/google/sync", async (req, res, next) => {
  try {
    if (!googleConfigured()) {
      throw ApiError.badRequest("Google Calendar is not configured on this server.");
    }
    const userId = req.user.id;

    const connections = await activeConnections(userId);
    if (connections.length === 0) {
      throw ApiError.badRequest("No linked Google accounts to sync.");
    }

    const now = new Date();
    const timeMin = new Date(now.getTime() - 180 * 86_400_000).toISOString();
    const timeMax = new Date(now.getTime() + 365 * 86_400_000).toISOString();

    let eventsAdded = 0;
    let eventsUpdated = 0;
    let eventsDeleted = 0;
    let mergedDuplicates = 0;
    // Fingerprints of meetings already seen in this sync, across every account.
    // Seven Google accounts each receive a copy of the same invite, and this is
    // what stops it counting seven times. `dedupeEvents` hides the extra copies
    // when the day is built; this keeps the stored flag in agreement.
    const seenMeetings = new Set<string>();
    const accounts: Array<{ id: string; email: string; ok: boolean; error: string | null }> = [];

    for (const connection of connections) {
      try {
        const token = await accessTokenFor(connection);

        // Refresh this account's calendar list. Failure is contained to this
        // account: one dead grant must not stop the other six from syncing.
        const listed = await syncConnectionCalendars(connection);
        if (listed.error) {
          accounts.push({ id: connection.id, email: "", ok: false, error: listed.error });
          continue;
        }
        const present = listed.calendars.map((c) => c.id);
        // Scoped to this connection. An unfiltered "notIn present" would unlink
        // the calendars belonging to every *other* account, since none of them
        // appear in this account's list.
        await prisma.linkedGoogleCalendar.updateMany({
          where: { connectionId: connection.id, isLinked: true, id: { notIn: present } },
          data: { isLinked: false },
        });

        const linked = await prisma.linkedGoogleCalendar.findMany({
          where: { connectionId: connection.id, isLinked: true },
        });

        for (const cal of linked) {
          const remote = await getEvents(token, cal.id, timeMin, timeMax);
          const remoteItems = remote.items ?? [];

          // Scoped to (connection, calendar): a Google event id is unique only
          // within one calendar of one account, so matching on the id alone
          // would let account 2's `primary` overwrite account 1's rows.
          const stored = await prisma.calendarEvent.findMany({
            where: {
              userId,
              source: "GOOGLE",
              connectionId: connection.id,
              sourceCalendarId: cal.id,
              isDeleted: false,
            },
            select: { id: true, googleEventId: true },
          });
          const storedById = new Map(stored.map((e) => [e.googleEventId, e.id]));
          const remoteIds = new Set<string>();

          for (const item of remoteItems) {
            if (item.status === "cancelled") continue;
            const googleEventId = item.id;
            remoteIds.add(googleEventId);

            const title = (item.summary ?? "").trim() || "(Untitled)";
            const allDay = !item.start?.dateTime;
            const startIso = allDay ? `${item.start?.date}T00:00:00` : item.start?.dateTime;
            const endIso = allDay
              ? `${item.end?.date ?? item.start?.date}T23:59:59`
              : item.end?.dateTime;
            if (!startIso || !endIso) continue;

            const startTime = new Date(startIso);
            const endTime = new Date(endIso);
            if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) continue;

            const fingerprint = eventFingerprint({ title, startTime, endTime, allDay });
            const isDuplicate = seenMeetings.has(fingerprint);
            seenMeetings.add(fingerprint);

            const data = {
              userId,
              source: "GOOGLE" as const,
              googleEventId,
              sourceCalendarId: cal.id,
              connectionId: connection.id,
              title,
              description: item.description ?? null,
              startTime,
              endTime,
              allDay,
              location: item.location ?? null,
              color: gcalColor(item.colorId),
              isDedupedDuplicate: isDuplicate,
              isDeleted: false,
              googleUpdatedAt: now,
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

          // Remote deletions: rows for this (connection, calendar) that the
          // latest pull did not return.
          const toHide = stored.filter((e) => !remoteIds.has(e.googleEventId!));
          if (toHide.length > 0) {
            await prisma.calendarEvent.updateMany({
              where: { id: { in: toHide.map((e) => e.id) } },
              data: { isDeleted: true },
            });
            eventsDeleted += toHide.length;
          }
        }

        await prisma.googleConnection.update({
          where: { id: connection.id },
          data: { lastSyncedAt: now, lastError: null },
        });
        accounts.push({ id: connection.id, email: "", ok: true, error: null });
      } catch (err) {
        // Keep going: the remaining accounts are independent of this one.
        // Google's error bodies run to a few hundred characters of JSON; the
        // account list needs a sentence, not a stack trace.
        const message = describe(err).slice(0, 160);
        await prisma.googleConnection
          .update({ where: { id: connection.id }, data: { lastError: message } })
          .catch(() => undefined);
        accounts.push({ id: connection.id, email: "", ok: false, error: message });
      }
    }

    const failed = accounts.filter((a) => !a.ok);
    res.json({
      ok: true,
      data: {
        eventsAdded,
        eventsUpdated,
        eventsDeleted,
        mergedDuplicates,
        accountsSynced: accounts.length - failed.length,
        accountsFailed: failed.length,
        // Surfaced so the settings screen can say which account needs attention
        // instead of the sync looking like it simply found nothing.
        failures: failed.map((a) => ({ connectionId: a.id, error: a.error })),
      },
    });
    recordEvent(req.user.id, EventType.CALENDAR_EVENT_SYNCED, {
      source: "GOOGLE",
      eventsAdded,
      eventsUpdated,
      eventsDeleted,
      mergedDuplicates,
      accountsSynced: accounts.length - failed.length,
      accountsFailed: failed.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;