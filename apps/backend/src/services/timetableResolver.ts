/**
 * Resolves the recurring weekly `Course.schedule` plus the dated
 * `TimetableEntry` rows into concrete occurrences for a given week.
 *
 * This is the single place that answers "what actually happens". The timetable
 * grid, the calendar and attendance all read it, so a holiday or a rescheduled
 * class cannot be honoured in one view and ignored in another.
 *
 * Pure and synchronous: it takes plain data, so it is testable without a
 * database.
 */
import type {
  Course,
  CourseScheduleSlot,
  CourseSlotType,
  TimetableEntry,
  TimetableOccurrence,
  TimetableWeek,
  ReplacesSlot,
} from '@prodapp/shared-types';
import { addDaysTz, weekdayOfKey } from '../lib/tz.js';
import { isCourseSlotType } from '../lib/timetableKinds.js';

/** A course reduced to what the resolver needs. */
export interface ResolvableCourse {
  id: string;
  name: string;
  code: string | null;
  schedule: unknown;
  /** YYYY-MM-DD the course was created; the oldest course sets term week 1. */
  createdAt?: string;
}

export interface ResolvableEntry {
  id: string;
  courseId: string | null;
  title: string;
  kind: TimetableEntry['kind'];
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  replacesSlot: unknown;
  courseName?: string | null;
}

/** Monday of the week containing `date`. */
export function weekStartOf(date: string): string {
  const dow = weekdayOfKey(date); // 0 = Sunday
  const sinceMonday = (dow + 6) % 7;
  return addDaysTz(date, -sinceMonday);
}

/** The 7 date keys of the week beginning `weekStart`. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysTz(weekStart, i));
}

/**
 * Week number counted from `origin`'s week.
 *
 * Term week 1 is the week containing `origin`, so a course created in
 * September keeps "week 8" meaning eight weeks later rather than snapping to
 * the calendar's own week numbering.
 */
export function weekNumberOf(weekStart: string, origin: string): number {
  const start = weekStartOf(origin);
  return Math.round(
    (Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / (7 * 86_400_000),
  ) + 1;
}

const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidSlotType = isCourseSlotType;

function isClock(value: unknown): value is string {
  return typeof value === 'string' && CLOCK_RE.test(value);
}

export function timeToMinutes(time: string): number {
  const m = CLOCK_RE.exec(time);
  if (!m) return Number.NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * A weekly slot, read defensively.
 *
 * `Course.schedule` is a Json column written before `type`/`weekNumber`/
 * `location` existed, so every one of them is optional and anything malformed
 * is dropped rather than guessed at. `type` defaults to CLASS, which is what
 * makes an untouched schedule behave exactly as it did before.
 */
export interface ResolvedSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  type: CourseSlotType;
  weekNumber: number | null;
  location: string | null;
}

export function readSlots(schedule: unknown): ResolvedSlot[] {
  if (!Array.isArray(schedule)) return [];
  const out: ResolvedSlot[] = [];
  for (const raw of schedule) {
    if (typeof raw !== 'object' || raw === null) continue;
    const s = raw as Record<string, unknown>;
    if (
      typeof s.dayOfWeek !== 'number' ||
      !Number.isInteger(s.dayOfWeek) ||
      s.dayOfWeek < 0 ||
      s.dayOfWeek > 6 ||
      !isClock(s.startTime) ||
      !isClock(s.endTime)
    ) {
      continue;
    }
    if (timeToMinutes(s.endTime) <= timeToMinutes(s.startTime)) continue;
    out.push({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      // An unknown type is treated as CLASS rather than dropped: a bad label
      // must not make a real class disappear from someone's timetable.
      type: isValidSlotType(s.type) ? s.type : 'CLASS',
      weekNumber:
        typeof s.weekNumber === 'number' && Number.isInteger(s.weekNumber) && s.weekNumber > 0
          ? s.weekNumber
          : null,
      location: typeof s.location === 'string' && s.location.trim() ? s.location.trim() : null,
    });
  }
  return out;
}

function readReplacesSlot(raw: unknown): ReplacesSlot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (
    typeof s.dayOfWeek !== 'number' ||
    !Number.isInteger(s.dayOfWeek) ||
    s.dayOfWeek < 0 ||
    s.dayOfWeek > 6 ||
    !isClock(s.startTime) ||
    !isClock(s.endTime)
  ) {
    return null;
  }
  return { dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime };
}

/** Entries that blank out a whole day for everyone, whatever course they name. */
const isDayWide = (kind: ResolvableEntry['kind']) => kind === 'HOLIDAY';

/** Entries that cancel the specific occurrence they are dated on. */
const isCancellation = (kind: ResolvableEntry['kind']) => kind === 'HOLIDAY' || kind === 'EXCEPTION';

export interface ResolveWeekInput {
  weekStart: string;
  courses: ResolvableCourse[];
  /** Defaults to empty so a caller cannot crash by forgetting it. */
  entries?: ResolvableEntry[];
  /** Week containing the earliest course; term week 1. */
  origin?: string;
}

/**
 * Flattens courses + entries into the occurrences of one week.
 *
 * Rules, in the order they are applied:
 *  1. A `weekNumber` slot only appears in that term week.
 *  2. A `HOLIDAY` entry removes every occurrence on its date, and is itself
 *     reported as an all-day occurrence.
 *  3. An `EXCEPTION` entry removes the occurrence it is dated against, and is
 *     itself reported so the gap can be explained rather than just missing.
 *  4. A `RESCHEDULED` entry removes the slot it names and re-adds it on the
 *     entry's own date and time.
 *  5. Any other dated entry is an addition, e.g. an exam.
 *
 * Cancelled occurrences are kept in the result with `happens: false` so the UI
 * can show *why* something is missing instead of leaving a silent hole.
 */
export function resolveWeek(input: ResolveWeekInput): TimetableWeek {
  const { weekStart, courses } = input;
  const entries = input.entries ?? [];
  const dates = weekDates(weekStart);
  const weekNumber = weekNumberOf(weekStart, input.origin ?? weekStart);

  /**
   * Slots claimed by a RESCHEDULED entry, built from the *whole* passed-in
   * entry set rather than the entries for each date.
   *
   * A class moved from Monday to Wednesday is dated on the Wednesday, but it
   * still has to vacate the Monday. Looking only at the Monday's own entries
   * would miss it and the class would simply happen twice.
   */
  const movedSlots = new Map<string, ResolvableEntry>();
  for (const e of entries) {
    if (e.kind !== 'RESCHEDULED' || !e.courseId) continue;
    const rs = readReplacesSlot(e.replacesSlot);
    if (!rs) continue;
    movedSlots.set(`${e.courseId}|${rs.dayOfWeek}|${rs.startTime}|${rs.endTime}`, e);
  }

  const byDate = new Map<string, ResolvableEntry[]>();
  for (const e of entries) {
    if (!dates.includes(e.date)) continue;
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  const occurrences: TimetableOccurrence[] = [];

  for (const date of dates) {
    const dayEntries = byDate.get(date) ?? [];
    // Name the holiday rather than the word "Holiday", so the grid can say
    // *why* a day is empty. An exception already reports its own title.
    const dayHoliday = dayEntries.find((e) => isDayWide(e.kind));

    // ---- recurring weekly slots -------------------------------------------
    const dow = weekdayOfKey(date);
    for (const course of courses) {
      for (const slot of readSlots(course.schedule)) {
        if (slot.dayOfWeek !== dow) continue;
        if (slot.weekNumber !== null && slot.weekNumber !== weekNumber) continue;

        const key = `${course.id}-${slot.startTime}-${slot.endTime}`;
        const occurrence: TimetableOccurrence = {
          key: `class-${key}`,
          courseId: course.id,
          courseName: course.name,
          courseCode: course.code,
          dayOfWeek: slot.dayOfWeek,
          date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          type: slot.type,
          location: slot.location,
          weekNumber: slot.weekNumber,
          happens: true,
          cancelledReason: null,
          moved: false,
          entryId: null,
        };

        if (dayHoliday) {
          occurrence.happens = false;
          occurrence.cancelledReason = dayHoliday.title;
          occurrences.push(occurrence);
          continue;
        }

        // A cancellation aimed at this exact slot.
        const cancelledBy = dayEntries.find(
          (e) =>
            isCancellation(e.kind) &&
            e.courseId === course.id &&
            e.startTime === slot.startTime &&
            e.endTime === slot.endTime,
        );
        if (cancelledBy) {
          occurrence.happens = false;
          occurrence.cancelledReason = cancelledBy.title;
          occurrences.push(occurrence);
          continue;
        }

        // A RESCHEDULED entry for this slot means it does not happen here; it
        // is re-added on the entry's own date further down.
        const movedAway = movedSlots.get(
          `${course.id}|${slot.dayOfWeek}|${slot.startTime}|${slot.endTime}`,
        );
        if (movedAway) {
          // Rescheduled onto the very same day and time: drop the weekly
          // occurrence so the addition below is not a double booking.
          if (movedAway.date === date && movedAway.startTime === slot.startTime) continue;
          occurrence.happens = false;
          occurrence.cancelledReason = `Rescheduled to ${movedAway.date}${
            movedAway.startTime ? ` ${movedAway.startTime}` : ''
          }`;
          occurrence.moved = true;
          occurrences.push(occurrence);
          continue;
        }

        occurrences.push(occurrence);
      }
    }

    // ---- dated additions --------------------------------------------------
    for (const entry of dayEntries) {
      if (entry.kind === 'EXCEPTION') continue; // already shown as a removal
      const isRescheduled = entry.kind === 'RESCHEDULED';
      const course = entry.courseId
        ? courses.find((c) => c.id === entry.courseId)
        : undefined;

      occurrences.push({
        key: `entry-${entry.id}`,
        courseId: entry.courseId ?? '',
        courseName: entry.courseName ?? entry.title,
        courseCode: course?.code ?? null,
        dayOfWeek: weekdayOfKey(date),
        date,
        startTime: entry.startTime ?? '00:00',
        endTime: entry.endTime ?? '23:59',
        type: isRescheduled
          ? 'CLASS'
          : entry.kind === 'EXAM'
            ? 'EXAM'
            : entry.kind === 'HOLIDAY'
              ? 'HOLIDAY'
              : entry.kind === 'EVENT'
                ? 'EVENT'
                : 'INTERNAL',
        location: entry.location,
        weekNumber: null,
        happens: true,
        cancelledReason: null,
        moved: isRescheduled,
        entryId: entry.id,
      });
    }
  }

  occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

  return {
    weekStart,
    weekNumber,
    occurrences,
    entries: entries.filter((e) => dates.includes(e.date)) as TimetableEntry[],
  };
}

/**
 * Occurrences on a single day, honouring the same rules as `resolveWeek`.
 *
 * The day model calls this instead of iterating the schedule itself, so a
 * holiday or a rescheduled class cannot reserve capacity it should not.
 */
/**
 * Resolve a single day.
 *
 * `origin` is the term's first day. It is required for `weekNumber` slots to
 * mean anything: without it the requested week is treated as term week 1, so a
 * "week 5 only" class would quietly show up in every week. Callers that hold
 * the user's courses should pass their earliest course's date.
 */
export function resolveDay(
  date: string,
  courses: ResolvableCourse[],
  entries: ResolvableEntry[] = [],
  origin?: string,
): TimetableOccurrence[] {
  return resolveWeek({ weekStart: weekStartOf(date), courses, entries, origin }).occurrences.filter(
    (o) => o.date === date,
  );
}

/** YYYY-MM-DD from a Date or an ISO string. `String(date)` is not one. */
const dateKey = (value: Date | string): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);

/**
 * The first day of the term, taken from the oldest course the user has.
 * A brand-new user starts their term on the week they first added a class.
 */
export const termOrigin = (courses: { createdAt: Date | string }[]): string | undefined => {
  if (courses.length === 0) return undefined;
  const oldest = courses.reduce((a, b) => (dateKey(a.createdAt) <= dateKey(b.createdAt) ? a : b));
  return dateKey(oldest.createdAt);
};

/** Does a timetable occurrence count as a class the user must attend? */
export function generatesAttendance(occurrence: TimetableOccurrence): boolean {
  return occurrence.happens && occurrence.type === 'CLASS';
}

/** Map a Prisma course row to the resolver's input shape. */
export const toResolvableCourse = (c: {
  id: string;
  name: string;
  code: string | null;
  schedule: unknown;
  createdAt?: Date | string;
}): ResolvableCourse => ({
  id: c.id,
  name: c.name,
  code: c.code,
  schedule: c.schedule,
  createdAt: c.createdAt === undefined ? undefined : dateKey(c.createdAt),
});

/** Map a Prisma timetable entry row to the resolver's input shape. */
export const toResolvableEntry = (e: {
  id: string;
  courseId: string | null;
  title: string;
  kind: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  replacesSlot: unknown;
  course?: { name: string } | null;
}): ResolvableEntry => ({
  id: e.id,
  courseId: e.courseId,
  title: e.title,
  kind: e.kind as TimetableEntry['kind'],
  date: e.date,
  startTime: e.startTime,
  endTime: e.endTime,
  location: e.location,
  replacesSlot: e.replacesSlot,
  courseName: e.course?.name ?? null,
});

export type { Course, CourseScheduleSlot, TimetableEntry };
