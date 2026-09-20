import type { ID } from './index';

export interface CourseScheduleSlot {
  /** 0 = Sunday, 1 = Monday ... 6 = Saturday (JS Date#getDay convention). */
  dayOfWeek: number;
  /** "HH:MM" 24h, e.g. "09:00". */
  startTime: string;
  endTime: string;
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