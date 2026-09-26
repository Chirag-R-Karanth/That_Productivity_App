/**
 * Google Tasks, across every linked Google account.
 *
 * Tasks are read-write, so this file has two halves that have to agree with each
 * other: a pull that folds what Google holds into `tasks`, and the push helpers
 * that the local task routes call so a change made here also lands there.
 *
 * The identity of a Google task is (connection, task list, task id). None of
 * those three is unique on its own -- every account has a list called
 * "@default", and task ids repeat across lists and accounts -- so nothing here
 * may look a task up by id alone.
 */

import { prisma } from "../lib/prisma.js";
import { zonedParts } from "../lib/tz.js";
import {
  accessTokenFor,
  activeConnections,
  describe,
  type ConnectionForSync,
} from "./googleConnections.js";
import {
  deleteTask as gcalDeleteTask,
  getTask,
  GoogleApiError,
  insertTask,
  listTaskLists,
  listTasks,
  patchTask,
  type GoogleTask,
  type GoogleTaskList,
} from "./google.js";

/**
 * One account's task lists, discovered once and remembered on the connection.
 *
 * A 404 here means this account has no Google Tasks service at all -- some
 * Google Workspace domains turn it off for the whole organisation. That is a
 * permanent property of the account, not a broken grant, so it is reported as
 * "no task lists" rather than as a failure: the account's calendars keep
 * working, and retrying every sync would fail identically forever while making
 * the account look broken.
 */
async function taskListsFor(
  connection: ConnectionForSync & { defaultTaskListId?: string | null },
  token: string,
): Promise<GoogleTaskList[]> {
  let listed: { items?: GoogleTaskList[] };
  try {
    listed = await listTaskLists(token);
  } catch (err) {
    if (err instanceof GoogleApiError && err.status === 404) {
      await prisma.googleConnection
        .update({
          where: { id: connection.id },
          data: { lastError: "Google Tasks is unavailable for this account" },
        })
        .catch(() => undefined);
      return [];
    }
    throw err;
  }
  const lists = listed.items ?? [];
  if (lists.length === 0) return [];

  // Remember where locally created tasks should go. A user who has never used
  // Google Tasks is left with null rather than being made to create a list.
  if (!connection.defaultTaskListId) {
    const preferred = lists.find((l) => l.title === "@default") ?? lists[0];
    await prisma.googleConnection.update({
      where: { id: connection.id },
      data: { defaultTaskListId: preferred.id },
    });
  }
  return lists;
}

/** Pull every page of a list. A long list must not be silently truncated. */
async function allTasks(token: string, listId: string): Promise<GoogleTask[]> {
  const out: GoogleTask[] = [];
  let pageToken: string | undefined;
  do {
    const res = await listTasks(token, listId, { showCompleted: true, showHidden: true });
    out.push(...(res.items ?? []));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

/**
 * Google Tasks has no all-day task, so a date with no time is carried as local
 * noon. Noon rather than midnight because midnight UTC lands on the previous day
 * for anyone east of Greenwich, which would move a deadline the day earlier.
 */
/**
 * Google Tasks has no time of day. A `due` arrives as an RFC3339 instant but
 * only its UTC date is kept -- the time is silently dropped and comes back as
 * midnight -- so a deadline is pushed and read as a plain date and a local time
 * is a detail that exists only in this app.
 *
 * Verified against the live API: every offset and every time of day sent for
 * 2026-09-30 came back as 2026-09-30T00:00:00.000Z.
 */
const DATE_ONLY_NOON = "12:00:00.000Z";

/** The date Google holds, read straight off the UTC date it stored. */
function splitDue(due: string | undefined): { date: string } | null {
  if (!due) return null;
  const at = new Date(due);
  if (Number.isNaN(at.getTime())) return null;
  // The UTC date, not a local one: converting into the user's zone would move a
  // deadline to the neighbouring day, which is a change the user never asked
  // for and Google never made.
  return { date: at.toISOString().slice(0, 10) };
}

/**
 * The deadline to send, as the instant Google requires.
 *
 * The date is sent at noon UTC so the UTC date is the local due date whatever
 * offset the reader is in, and so the value still means the middle of the day
 * if Google ever does start honouring a time. The offset cannot be left off:
 * Google answers 400 INVALID_ARGUMENT for a due date that is not RFC3339.
 */
function toGoogleDue(dueDate: string | null): string | undefined {
  if (!dueDate) return undefined;
  return `${dueDate}T${DATE_ONLY_NOON}`;
}

export interface GoogleTaskSyncResult {
  tasksPulled: number;
  tasksPushedToGoogle: number;
  tasksCompletedRemotely: number;
  accountsSynced: number;
  accountsFailed: number;
  failures: { connectionId: string; error: string }[];
}

/**
 * Fold every linked account's tasks into the local list.
 *
 * One account failing does not stop the others: with several accounts linked, a
 * single expired grant must not leave the user thinking they have no tasks.
 */
export async function syncGoogleTasks(userId: string): Promise<GoogleTaskSyncResult> {
  const connections = await activeConnections(userId);
  const result: GoogleTaskSyncResult = {
    tasksPulled: 0,
    tasksPushedToGoogle: 0,
    tasksCompletedRemotely: 0,
    accountsSynced: 0,
    accountsFailed: 0,
    failures: [],
  };

  for (const connection of connections) {
    try {
      const token = await accessTokenFor(connection);
      const lists = await taskListsFor(connection, token);
      const seen: { taskId: string; listId: string }[] = [];

      for (const list of lists) {
        for (const remote of await allTasks(token, list.id)) {
          seen.push({ taskId: remote.id, listId: list.id });

          const existing = await prisma.task.findFirst({
            where: {
              userId,
              connectionId: connection.id,
              googleTaskListId: list.id,
              googleTaskId: remote.id,
            },
          });

          const due = splitDue(remote.due);
          const completed = remote.status === "completed";
          const data = {
            title: remote.title || "(Untitled)",
            notes: remote.notes ?? null,
            dueDate: due?.date ?? null,
            completed,
            completedAt: completed ? new Date(remote.updated ?? Date.now()) : null,
            connectionId: connection.id,
            googleTaskListId: list.id,
            googleTaskId: remote.id,
            googleETag: remote.etag ?? null,
            // A task deleted in Google is kept as a tombstone, so a stale local
            // copy cannot bring it back on a later sync.
            googleDeleted: remote.deleted === true,
            deletedAt: remote.deleted === true ? new Date(remote.updated ?? Date.now()) : null,
          };

          if (existing) {
            // `dueTime` is deliberately not in `data`: Google keeps no time of
            // day, so writing one back would erase a time set in this app.
            await prisma.task.update({ where: { id: existing.id }, data });
            if (completed && !existing.completed) result.tasksCompletedRemotely += 1;
          } else {
            await prisma.task.create({ data: { ...data, dueTime: null, userId } });
            result.tasksPulled += 1;
          }
        }
      }

      // Anything this account used to have and no longer lists was removed
      // there. Scoped to the account, and only to rows that came from it.
      const gone = await prisma.task.findMany({
        where: {
          userId,
          connectionId: connection.id,
          googleTaskId: { not: null },
          googleDeleted: false,
        },
        select: { id: true, googleTaskId: true, googleTaskListId: true },
      });
      const removed = gone.filter(
        (t) => !seen.some((s) => s.taskId === t.googleTaskId && s.listId === t.googleTaskListId),
      );
      for (const t of removed) {
        await prisma.task.update({
          where: { id: t.id },
          data: { googleDeleted: true, deletedAt: new Date() },
        });
      }

      result.accountsSynced += 1;
    } catch (err) {
      // Recorded per account so the UI can name it, rather than reported as an
      // empty task list. Trimmed because Google's error bodies are a few hundred
      // characters of JSON that mean nothing in a list of accounts.
      result.accountsFailed += 1;
      result.failures.push({ connectionId: connection.id, error: describe(err).slice(0, 160) });
    }
  }

  return result;
}

/**
 * Retry a write that lost a race.
 *
 * Google answers 412 when the task changed since it was read. Overwriting would
 * destroy a change the user made in the Google Tasks app, so the task is re-read
 * and the write is attempted once more against the fresh version.
 */
async function withConflictRetry<T>(
  write: (etag: string | null | undefined) => Promise<T>,
  taskListId: string,
  taskId: string,
  token: string,
): Promise<T> {
  try {
    return await write(null);
  } catch (err) {
    if (!(err instanceof GoogleApiError) || err.status !== 412) throw err;
    const fresh = await getTask(token, taskListId, taskId);
    return write(fresh.etag ?? null);
  }
}

/**
 * Note a failed push on the account, so the problem is visible in Settings
 * instead of the task list quietly disagreeing with Google.
 *
 * The push helpers swallow their errors on purpose. Google is a second system
 * that the user is not waiting on, and refusing to complete a task because
 * Google is unreachable would be a worse failure than a delayed sync. A grant
 * that is genuinely dead is already flagged by `accessTokenFor`.
 */
async function recordPushFailure(connectionId: string | null | undefined, err: unknown): Promise<void> {
  if (!connectionId) return;
  await prisma.googleConnection
    .update({ where: { id: connectionId }, data: { lastError: describe(err).slice(0, 500) } })
    .catch(() => undefined);
}

/** Push a locally created task to Google and record the link. */
export async function pushTaskCreate(userId: string, taskId: string): Promise<void> {
  const connections = await activeConnections(userId);
  if (connections.length === 0) return;
  const connection = connections[0];

  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task || task.googleTaskId) return;

  try {
    await pushCreate(connection, task);
  } catch (err) {
    await recordPushFailure(connection.id, err);
  }
}

async function pushCreate(
  connection: ConnectionForSync,
  task: { id: string; title: string; notes: string | null; dueDate: string | null },
): Promise<void> {
  const token = await accessTokenFor(connection);
  const lists = await taskListsFor(connection, token);
  if (lists.length === 0) return;
  const listId: string = connection.defaultTaskListId ?? lists[0].id;

  const created = await insertTask(token, listId, {
    title: task.title,
    notes: task.notes,
    due: toGoogleDue(task.dueDate),
  });

  await prisma.task.update({
    where: { id: task.id },
    data: {
      connectionId: connection.id,
      googleTaskListId: listId,
      googleTaskId: created.id,
      googleETag: created.etag ?? null,
      googlePushedAt: new Date(),
    },
  });
}

/** Push a local edit (title, notes, deadline, completion) to Google. */
export async function pushTaskUpdate(userId: string, taskId: string): Promise<void> {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  const { googleTaskId, googleTaskListId } = task ?? {};
  // A task the user made here has no Google counterpart to update.
  if (!task || !googleTaskId || !googleTaskListId || !task.connectionId) return;

  const connection = await prisma.googleConnection.findUnique({ where: { id: task.connectionId } });
  if (!connection || connection.needsRelink) return;

  try {
    await pushEdit(connection, { ...task, googleTaskId, googleTaskListId });
  } catch (err) {
    await recordPushFailure(connection.id, err);
  }
}

async function pushEdit(
  connection: ConnectionForSync,
  task: {
    id: string;
    title: string;
    notes: string | null;
    dueDate: string | null;
    dueTime: string | null;
    completed: boolean;
    googleTaskListId: string;
    googleTaskId: string;
  },
): Promise<void> {
  const token = await accessTokenFor(connection);

  const updated = await withConflictRetry(
    (etag) =>
      patchTask(
        token,
        task.googleTaskListId,
        task.googleTaskId,
        {
          title: task.title,
          notes: task.notes,
          due: toGoogleDue(task.dueDate),
          status: task.completed ? "completed" : "needsAction",
        },
        etag ?? undefined,
      ),
    task.googleTaskListId,
    task.googleTaskId,
    token,
  );

  await prisma.task.update({
    where: { id: task.id },
    data: {
      googleETag: updated.etag ?? null,
      googlePushedAt: new Date(),
      // Completing a task here is not a deletion in Google, so any tombstone is
      // cleared to keep the local and remote states described consistently.
      googleDeleted: false,
    },
  });
}

/** Push a local deletion to Google. */
export async function pushTaskDelete(userId: string, taskId: string): Promise<void> {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task?.googleTaskId || !task.googleTaskListId || !task.connectionId) return;

  const connection = await prisma.googleConnection.findUnique({ where: { id: task.connectionId } });
  if (!connection || connection.needsRelink) return;

  try {
    const token = await accessTokenFor(connection);
    await gcalDeleteTask(token, task.googleTaskListId, task.googleTaskId);
    await prisma.task.update({
      where: { id: task.id },
      data: { googleDeleted: true, googlePushedAt: new Date() },
    });
  } catch (err) {
    await recordPushFailure(connection.id, err);
  }
}
