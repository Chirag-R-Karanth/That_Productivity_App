import type { ID } from './index';

/**
 * What a weekly slot is.
 *
 * `CLASS` is the default whenever a slot does not name a type. Existing
 * schedules predate this field, so leaving it unset is what keeps them
 * behaving exactly as they did — including attendance generation.
 */
export type CourseSlotType = 'CLASS' | 'LAB' | 'EXAM' | 'INTERNAL' | 'HOLIDAY' | 'EVENT';

export const COURSE_SLOT_TYPES: readonly CourseSlotType[] = [
  'CLASS',
  'LAB',
  'EXAM',
  'INTERNAL',
  'HOLIDAY',
  'EVENT',
] as const;

export interface CourseScheduleSlot {
  /** 0 = Sunday, 1 = Monday ... 6 = Saturday (JS Date#getDay convention). */
  dayOfWeek: number;
  /** "HH:MM" 24h, e.g. "09:00". */
  startTime: string;
  endTime: string;
  /** Defaults to `CLASS` when absent. */
  type?: CourseSlotType;
  /**
   * Restricts a repeating slot to one week of the term, e.g. 8 for "week 8
   * only". Null/absent means it recurs every week.
   */
  weekNumber?: number | null;
  location?: string | null;
}

export interface Course {
  id: ID;
  userId: ID;
  name: string;
  code: string | null;
  schedule: CourseScheduleSlot[];
  /** Required attendance % threshold for this course, 0–100. */
  attendanceThreshold: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCourseRequest {
  name: string;
  code?: string | null;
  schedule?: CourseScheduleSlot[];
  attendanceThreshold?: number;
}

export interface UpdateCourseRequest {
  name?: string;
  code?: string | null;
  schedule?: CourseScheduleSlot[];
  attendanceThreshold?: number;
}

/** Computed live attendance percentage for a course. */
export interface CourseAttendanceSummary {
  course: Course;
  attended: number;
  missed: number;
  cancelled: number;
  unconfirmed: number;
  /** percentage = attended / (attended + missed) * 100. Cancelled excluded. */
  percentage: number | null;
  requiredThreshold: number;
  atRisk: boolean;
}

// ---------------------------------------------------------------------------
// One-off timetable entries
// ---------------------------------------------------------------------------

/**
 * A dated exception to, or addition to, the weekly timetable.
 *
 * The weekly `Course.schedule` is the recurring skeleton; entries are the
 * things that do not fit a weekly pattern: an exam on a Tuesday, a holiday, a
 * class that moved to a different day, a cancelled lab.
 */
export type TimetableEntryKind = 'EXAM' | 'HOLIDAY' | 'EXCEPTION' | 'RESCHEDULED' | 'EVENT';

export const TIMETABLE_ENTRY_KINDS: readonly TimetableEntryKind[] = [
  'EXAM',
  'HOLIDAY',
  'EXCEPTION',
  'RESCHEDULED',
  'EVENT',
] as const;

/** The weekly slot a `RESCHEDULED` entry stands in for. */
export interface ReplacesSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface TimetableEntry {
  id: ID;
  userId: ID;
  /** Null for entries that belong to no course, e.g. a campus holiday. */
  courseId: ID | null;
  courseName: string | null;
  title: string;
  kind: TimetableEntryKind;
  /** YYYY-MM-DD, in the user's timezone. */
  date: string;
  /** Null for all-day entries such as holidays. */
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  notes: string | null;
  /** Set on `RESCHEDULED` entries: the slot this occurrence replaces. */
  replacesSlot: ReplacesSlot | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTimetableEntryRequest {
  courseId?: ID | null;
  title: string;
  kind?: TimetableEntryKind;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
  replacesSlot?: ReplacesSlot | null;
}

export interface UpdateTimetableEntryRequest {
  courseId?: ID | null;
  title?: string;
  kind?: TimetableEntryKind;
  date?: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
  replacesSlot?: ReplacesSlot | null;
}

/**
 * A single weekly slot resolved onto a concrete date.
 *
 * This is what the grid, the calendar and attendance all read: the recurring
 * schedule plus the week's entries, flattened.
 */
export interface TimetableOccurrence {
  /** Stable across reloads: course id + original slot times. */
  key: string;
  courseId: ID;
  courseName: string;
  courseCode: string | null;
  /** 0 = Sunday. */
  dayOfWeek: number;
  /** YYYY-MM-DD in the user's timezone. */
  date: string;
  startTime: string;
  endTime: string;
  type: CourseSlotType;
  location: string | null;
  weekNumber: number | null;
  /** False when a HOLIDAY/EXCEPTION entry removed this occurrence. */
  happens: boolean;
  /** Why it does not happen, for explaining a gap in the grid. */
  cancelledReason: string | null;
  /** True when a RESCHEDULED entry moved it from its weekly day. */
  moved: boolean;
  /** Set when this occurrence is a one-off entry rather than a weekly slot. */
  entryId: ID | null;
}

/** A resolved week: 7 days x occurrences, for the timetable grid. */
export interface TimetableWeek {
  /** Monday of the resolved week, YYYY-MM-DD. */
  weekStart: string;
  /** 1-based ISO-ish week number counting from the first Monday on/after creation. */
  weekNumber: number;
  occurrences: TimetableOccurrence[];
  entries: TimetableEntry[];
}
