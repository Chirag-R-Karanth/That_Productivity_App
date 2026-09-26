/**
 * Linked Google accounts.
 *
 * A user may link several Google accounts; each is a row in `google_connections`
 * with its own tokens, calendars and task lists. Everything that has to reason
 * about "which Google account" goes through here so that the refresh, re-link
 * and skip rules are written once.
 */

import { prisma } from "../lib/prisma.js";
import {
  ensureConnectionAccessToken,
  GoogleApiError,
  listCalendars,
  type GoogleCalendarListItem,
  type GoogleConnectionRow,
} from "./google.js";

/** The connection columns token handling needs, without dragging in the model. */
export type ConnectionForSync = GoogleConnectionRow & {
  userId: string;
  needsRelink: boolean;
  /** Null until the account's task lists have been listed once. */
  defaultTaskListId?: string | null;
};

const connectionRow = {
  id: true,
  userId: true,
  accessToken: true,
  refreshToken: true,
  tokenExpiresAt: true,
  needsRelink: true,
  defaultTaskListId: true,
} as const;

/**
 * Record that Google will not talk to this account again.
 *
 * Only set for a failure a retry cannot fix, so a transient 500 does not make an
 * account look disconnected. The account is then skipped by later syncs until
 * the user reconnects, instead of every request retrying a dead grant.
 */
export async function markConnectionNeedsRelink(connectionId: string, reason: string): Promise<void> {
  await prisma.googleConnection.update({
    where: { id: connectionId },
    data: { needsRelink: true, lastError: reason.slice(0, 500) },
  });
}

/** A valid access token, refreshing and persisting as needed. */
export function accessTokenFor(connection: ConnectionForSync): Promise<string> {
  return ensureConnectionAccessToken(
    connection,
    (data) =>
      prisma.googleConnection.update({ where: { id: connection.id }, data }).then(() => undefined),
    (reason) => markConnectionNeedsRelink(connection.id, reason),
  );
}

/** Every linked account for a user that is still usable, oldest first. */
export function activeConnections(userId: string): Promise<ConnectionForSync[]> {
  return prisma.googleConnection.findMany({
    where: { userId, needsRelink: false },
    select: connectionRow,
    orderBy: { createdAt: "asc" },
  });
}

export interface SyncedCalendar {
  id: string;
  summary: string;
  backgroundColor: string | null;
  accessRole: string | null;
}

/**
 * Refresh the stored calendar list for one connection.
 *
 * Calendars are keyed by (connection, id) and not by id alone: every Google
 * account has a calendar called `primary`, so a user-wide key would make the
 * second account overwrite the first.
 */
export async function syncConnectionCalendars(
  connection: ConnectionForSync,
): Promise<{ calendars: SyncedCalendar[]; error: string | null }> {
  let token: string;
  try {
    token = await accessTokenFor(connection);
  } catch (e) {
    return { calendars: [], error: describe(e) };
  }

  let items: GoogleCalendarListItem[];
  try {
    const list = await listCalendars(token);
    items = list.items ?? [];
  } catch (e) {
    if (e instanceof GoogleApiError && e.tokenInvalid) {
      await markConnectionNeedsRelink(connection.id, e.message);
    }
    return { calendars: [], error: describe(e) };
  }

  const calendars = items.map((i) => ({
    id: i.id,
    summary: i.summary,
    backgroundColor: i.backgroundColor ?? null,
    accessRole: i.accessRole ?? null,
  }));

  // A calendar the user unlinked stays unlinked: `update` must not set isLinked
  // back to true, or unchecking a calendar would silently undo itself on the
  // next sync. Only the display metadata is refreshed here.
  await prisma.$transaction(
    calendars.map((c) =>
      prisma.linkedGoogleCalendar.upsert({
        where: { connectionId_id: { connectionId: connection.id, id: c.id } },
        create: {
          id: c.id,
          userId: connection.userId,
          connectionId: connection.id,
          summary: c.summary,
          backgroundColor: c.backgroundColor,
          accessRole: c.accessRole,
        },
        update: { summary: c.summary, backgroundColor: c.backgroundColor, accessRole: c.accessRole },
      }),
    ),
  );

  return { calendars, error: null };
}

/** A short, safe description of a failure for storage and for the UI. */
export function describe(e: unknown): string {
  if (e instanceof GoogleApiError) return e.message.slice(0, 500);
  if (e instanceof Error) return e.message.slice(0, 500);
  return String(e).slice(0, 500);
}
