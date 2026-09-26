/**
 * Attendance prompts: the one notification this app is genuinely for.
 *
 * "Did you actually attend the class that just finished?" is worth interrupting
 * for, because the alternative is an auto-mark that quietly writes ATTENDED and
 * an attendance percentage that drifts away from reality. Everything else the
 * app can tell you later; this one is only useful while it is still fresh.
 *
 * The rules it obeys:
 *
 *  - Ask once the class has *ended*, never before. A prompt at 09:00 for a
 *    class that runs to 10:30 is a prompt the user cannot answer.
 *  - Ask at most once per record per day. `attendancePromptedAt` is the
 *    receipt, so a cron running every 15 minutes cannot turn into 40 messages.
 *  - Judge the clock in the *user's* timezone, and read the timetable through
 *    the same resolver the grid and the day model use, so a class moved by an
 *    exception or lost to a holiday is not prompted about.
 *  - Never ask when the user has turned attendance notifications off, and
 *    never burn the receipt when there is nowhere to send it: a user who
 *    subscribes at lunchtime still gets asked about the morning class.
 *  - Take the notification back down as soon as the question is answered,
 *    whether the answer came from the user or from auto-mark.
 */
import { prisma } from "../lib/prisma.js";
import { addDaysTz, dayKeyInTz, minutesOfDayInTz } from "../lib/tz.js";
import {
  generatesAttendance,
  resolveDay,
  termOrigin,
  timeToMinutes,
  toResolvableCourse,
  toResolvableEntry,
  weekStartOf,
} from "./timetableResolver.js";
import { pushToUser } from "./webpush.js";
import { dismissAttendanceNotification, sendAttendancePrompt } from "./fcm.js";

/** The tag a prompt is shown under, and later closed by. */
const promptTag = (recordId: string) => `attendance-${recordId}`;

export interface PromptRunResult {
  /** Records that qualified and were asked about. */
  prompted: number;
  /** Records that had already been asked about. */
  alreadyAsked: number;
  /** Web Push messages accepted by the push service. */
  sent: number;
  /** Deliveries that failed for a reason worth retrying. */
  failed: number;
  /** Dead subscriptions deleted as a side effect of delivering. */
  removed: number;
  /** Records that had nowhere to send a prompt, so the receipt was left open. */
  noDevice: number;
}

/**
 * Which of a user's attendance records deserve a prompt right now.
 *
 * Split out from the sending so the decision can be checked on its own: the
 * awkward cases (a class still running, a holiday, a record whose course was
 * deleted) are all about *which* records qualify, not about the network.
 */
export async function findRecordsToPrompt(
  user: { id: string; timezone: string | null },
  now: Date,
): Promise<{ due: { id: string; courseId: string; courseName: string }[]; alreadyAsked: number }> {
  const tz = user.timezone ?? "UTC";
  const today = dayKeyInTz(now, tz);
  const weekStart = weekStartOf(today);

  const [records, courses, entries] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { userId: user.id, date: today, status: "UNCONFIRMED" },
      include: { course: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.course.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    // A day either side of the week, so a class rescheduled into or out of
    // this week is seen arriving or leaving.
    prisma.timetableEntry.findMany({
      where: {
        userId: user.id,
        date: { gte: addDaysTz(weekStart, -1), lte: addDaysTz(weekStart, 7) },
      },
    }),
  ]);

  const resolvableCourses = courses.map(toResolvableCourse);
  const origin = termOrigin(courses);
  const resolvableEntries = entries.map(toResolvableEntry);
  const occurrences = resolveDay(today, resolvableCourses, resolvableEntries, origin);
  const minutesNow = minutesOfDayInTz(now, tz);

  const due: { id: string; courseId: string; courseName: string }[] = [];
  let alreadyAsked = 0;

  for (const record of records) {
    if (record.attendancePromptedAt) {
      alreadyAsked++;
      continue;
    }
    const ends = occurrences
      .filter((o) => o.courseId === record.courseId && generatesAttendance(o))
      .reduce((max, o) => Math.max(max, timeToMinutes(o.endTime)), -1);

    // No class runs, or it has not finished: either the record is a leftover
    // that auto-mark will clean up, or the answer is not knowable yet.
    if (ends < 0 || Number.isNaN(ends) || ends >= minutesNow) continue;

    due.push({
      id: record.id,
      courseId: record.courseId,
      courseName: record.course.name,
    });
  }

  return { due, alreadyAsked };
}

/**
 * Prompt for every unanswered class that has finished today.
 *
 * Safe to call as often as you like: the receipt is written inside the same
 * pass, so a second call with nothing changed in between finds nothing to do.
 */
export async function promptUnansweredAttendance(
  now: Date = new Date(),
  /** Restrict to one user. Used by the checks; the cron always passes none. */
  onlyUserId?: string,
): Promise<PromptRunResult> {
  const result: PromptRunResult = {
    prompted: 0,
    alreadyAsked: 0,
    sent: 0,
    failed: 0,
    removed: 0,
    noDevice: 0,
  };

  const users = await prisma.user.findMany({
    where: {
      ...(onlyUserId ? { id: onlyUserId } : {}),
      // A user with attendance notifications switched off is not asked
      // anything, and is not even loaded.
      notifyAttendance: true,
      courses: { some: {} },
    },
    select: { id: true, timezone: true, fcmToken: true },
    orderBy: { id: "asc" },
  });

  for (const user of users) {
    const { due, alreadyAsked } = await findRecordsToPrompt(user, now);
    result.alreadyAsked += alreadyAsked;
    if (due.length === 0) continue;

    for (const record of due) {
      const web = await pushToUser(user.id, {
        title: "Attendance",
        body: `Did you attend ${record.courseName}?`,
        url: `/attendance?record=${record.id}`,
        tag: promptTag(record.id),
        requireInteraction: true,
        data: { type: "attendance_prompt", recordId: record.id, courseId: record.courseId },
      });

      result.sent += web.sent;
      result.failed += web.failed;
      result.removed += web.removed;

      // A phone is a second door to knock on, not a substitute for a browser
      // one. Its send is what decides whether it counts: a token that Firebase
      // rejects, or that was never configured, is not a delivered prompt.
      let delivered = web.sent > 0;
      if (user.fcmToken) {
        const byFirebase = await sendAttendancePrompt({
          token: user.fcmToken,
          courseName: record.courseName,
          courseId: record.courseId,
          recordId: record.id,
        });
        delivered = byFirebase || delivered;
      }

      // The receipt is only written when a message was really accepted. A user
      // with no subscribed browser and no phone is owed their prompt, not
      // quietly written off — they will get it as soon as one is registered.
      if (!delivered) {
        result.noDevice++;
        continue;
      }
      await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: { attendancePromptedAt: now },
      });
      result.prompted++;
    }
  }

  return result;
}

/**
 * Take a prompt back down once its question has an answer.
 *
 * Called on both paths that resolve a record — the user tapping Yes/No, and
 * auto-mark deciding for them — because a notification still asking about a
 * record that is now settled is worse than no notification at all.
 *
 * The FCM token is read here rather than passed in because the two callers
 * reach this from different directions (a request that has the user id, and a
 * batch job that has a list of records) and neither should have to remember to
 * fetch a field this function is the only consumer of.
 */
export async function dismissAttendancePrompt(
  userId: string,
  recordId: string,
): Promise<void> {
  await pushToUser(userId, {
    title: "Attendance",
    body: "",
    url: "/attendance",
    tag: promptTag(recordId),
    data: { type: "attendance_dismiss", recordId },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });
  if (user?.fcmToken) {
    await dismissAttendanceNotification(user.fcmToken, recordId);
  }
}
