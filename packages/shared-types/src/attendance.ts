import type { ID } from './index';
import type { Course } from './course';

export type AttendanceStatus = 'ATTENDED' | 'MISSED' | 'CANCELLED' | 'UNCONFIRMED';

export interface AttendanceRecord {
  id: ID;
  userId: ID;
  courseId: ID;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  /** Set when the user (or auto-rule) resolves an UNCONFIRMED record. */
  confirmedAt: string | null;
  createdAt: string;
}

export interface AttendanceRecordWithCourse extends AttendanceRecord {
  course: Course;
}

/** Create endpoint used by the daily cron only — but exposed with auth for test/backfill. */
export interface CreateAttendanceRecordRequest {
  courseId: ID;
  date: string;
}

export interface ResolveAttendanceRequest {
  status: Exclude<AttendanceStatus, 'UNCONFIRMED'>;
}

export interface AttendanceDay {
  date: string;
  records: AttendanceRecordWithCourse[];
}

/** Data surfaced on the dashboard for "today's remaining classes". */
export interface TodayClass {
  course: Course;
  slot: Course['schedule'][number];
  /** May be null if record already confirmed/resolved. */
  attendanceRecord: AttendanceRecord | null;
}