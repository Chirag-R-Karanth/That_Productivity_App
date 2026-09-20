import type { User, AuthResponse, RegisterRequest, LoginRequest, UpdateUserRequest } from './user';
import type {
  CreateTaskRequest,
  UpdateTaskRequest,
  Task,
  TaskQueryParams,
} from './task';
import type { CreateCourseRequest, UpdateCourseRequest, Course, CourseAttendanceSummary } from './course';
import type {
  AttendanceRecord,
  AttendanceRecordWithCourse,
  AttendanceDay,
  ResolveAttendanceRequest,
  TodayClass,
} from './attendance';
import type { CalendarDay, LinkedCalendar, SyncCalendarResult } from './calendar';
import type { FocusTimeSummary, PomodoroSession, StartPomodoroRequest } from './pomodoro';

/**
 * Single API contract shared by the web PWA and the Android app.
 * Each platform implements this against the Express backend.
 */
export interface ProductivityApi {
  auth: {
    register(req: RegisterRequest): Promise<AuthResponse>;
    login(req: LoginRequest): Promise<AuthResponse>;
    me(): Promise<User>;
    updateUser(req: UpdateUserRequest): Promise<User>;
  };
  tasks: {
    list(query?: TaskQueryParams): Promise<Task[]>;
    create(req: CreateTaskRequest): Promise<Task>;
    update(id: string, req: UpdateTaskRequest): Promise<Task>;
    complete(id: string, completed: boolean): Promise<Task>;
    /** Soft delete — sets deleted_at, never removes the row. */
    remove(id: string): Promise<void>;
    /** Resolve recurring occurrences into concrete dates within a window. */
    occurrences(from: string, to: string): Promise<TaskOccurrenceView[]>;
  };
  courses: {
    list(): Promise<Course[]>;
    create(req: CreateCourseRequest): Promise<Course>;
    update(id: string, req: UpdateCourseRequest): Promise<Course>;
    remove(id: string): Promise<void>;
    summaries(): Promise<CourseAttendanceSummary[]>;
  };
  attendance: {
    /** All records for a given date range (used for history + export). */
    listRange(from: string, to: string): Promise<AttendanceDay[]>;
    /** Today's classes still ahead, with live attendance records. */
    today(): Promise<TodayClass[]>;
    resolve(recordId: string, req: ResolveAttendanceRequest): Promise<AttendanceRecord>;
  };
  calendar: {
    listLinked(): Promise<LinkedCalendar[]>;
    sync(): Promise<SyncCalendarResult>;
    /** Merged, deduped view for a date or week window. */
    events(from: string, to: string): Promise<CalendarDay[]>;
    unlink(calendarId: string): Promise<void>;
  };
  pomodoro: {
    list(from: string, to: string): Promise<PomodoroSession[]>;
    start(req: StartPomodoroRequest): Promise<PomodoroSession>;
    end(id: string, completed: boolean): Promise<PomodoroSession>;
    focusSummary(from: string, to: string): Promise<FocusTimeSummary>;
  };
}

export interface TaskOccurrenceView {
  /** Derived dueDate of this occurrence (YYYY-MM-DD). */
  dueDate: string;
  task: import('./task').Task;
  completed: boolean;
}

/** Response envelope used by all backend endpoints. */
export interface ApiEnvelope<T> {
  ok: true;
  data: T;
}

export interface ApiErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    /** Extra error metadata, e.g. field-level validation problems. */
    details?: Record<string, string>;
  };
}

export type ApiResult<T> = ApiEnvelope<T> | ApiErrorEnvelope;