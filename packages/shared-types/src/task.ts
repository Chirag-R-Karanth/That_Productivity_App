import type { ID } from './index';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type TaskStatus = 'ACTIVE' | 'COMPLETED' | 'DELETED';

/**
 * iCalendar RRULE string, e.g. "FREQ=WEEKLY;BYDAY=FR".
 * Recurring task definition — occurrences are derived at query time.
 */
export interface Task {
  id: ID;
  userId: ID;
  title: string;
  notes: string | null;
  dueDate: string | null;
  dueTime: string | null;
  /**
   * The day this work is reserved for, as distinct from `dueDate` (the
   * deadline). A plan can be light on a heavy day; a deadline cannot move.
   */
  plannedDate?: string | null;
  /**
   * Effort in minutes. Kept as a single integer rather than a T-shirt size,
   * because only minutes can be compared against minutes of real capacity.
   * Null means "not thought about", and is shown as such rather than guessed.
   */
  estimateMinutes?: number | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  courseId: ID | null;
  courseName?: string | null;
  recurrenceRule: string | null;
  /** Server-computed: date of the last completed occurrence for recurring tasks. */
  lastCompletedOccurrence?: string | null;
  priority: TaskPriority;
  deletedAt: string | null;
  /** Server-computed: whether this task recurs. */
  isRecurring?: boolean;
  /** Server-computed: effective date to display (next occurrence for recurring, dueDate for one-off). */
  displayDate?: string | null;
  /** Server-computed: next pending occurrence date for recurring tasks. */
  nextOccurrence?: string | null;
}

export interface CreateTaskRequest {
  /** Optional client-generated id for idempotent offline replay. */
  id?: string;
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  /** Reserve this work for a specific day. */
  plannedDate?: string | null;
  /** Effort in minutes. */
  estimateMinutes?: number | null;
  courseId?: string | null;
  /** iCalendar RRULE, e.g. "FREQ=WEEKLY;BYDAY=FR" */
  recurrenceRule?: string | null;
  priority?: TaskPriority;
}

export interface UpdateTaskRequest {
  title?: string;
  notes?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  plannedDate?: string | null;
  estimateMinutes?: number | null;
  courseId?: string | null;
  recurrenceRule?: string | null;
  priority?: TaskPriority;
}

/** Occurrence of a recurring task within a lookup window. */
export interface TaskOccurrence {
  taskId: ID;
  /** The date this particular occurrence falls on. */
  dueDate: string;
  dueTime: string | null;
  /** True if this occurrence has been completed (occurrence-specific completion stored in DB). */
  completed: boolean;
  completedAt: string | null;
}

export type TaskFilter = 'today' | 'overdue' | 'all' | 'by-course';
export type TaskSortKey = 'due_date' | 'priority' | 'created_at';

export interface TaskQueryParams {
  filter?: TaskFilter;
  courseId?: ID;
  /** RFC3339 timestamp — use for last-write-wins conflict resolution. */
  from?: string;
  sortBy?: TaskSortKey;
}

/**
 * Payload sent to the offline-queue middleware. Contains enough to re-apply
 * a client-side action when connectivity is restored.
 */
export interface OfflineTaskAction {
  type: 'create' | 'complete' | 'uncomplete' | 'update' | 'delete';
  /** Client-generated UUID so double-apply is avoided via idempotency key. */
  idempotencyKey: string;
  task?: CreateTaskRequest & { id?: ID };
  taskId?: ID;
}