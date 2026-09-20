import type { ID } from './index';

export interface PomodoroSession {
  id: ID;
  userId: ID;
  taskId: ID | null;
  startedAt: string;
  /** Actual duration in full minutes. */
  durationMinutes: number;
  /** True when a full work session was completed, false when cut short. */
  completed: boolean;
  createdAt: string;
}

export interface StartPomodoroRequest {
  taskId?: ID | null;
  /** Session duration in minutes (defaults to user setting). */
  durationMinutes?: number;
}

/** Logged only when a session ends (either completed or cut short). */
export interface EndPomodoroRequest {
  id: ID;
  completed: boolean;
}

export interface FocusTimeSummary {
  /** Total completed focus minutes in the window. */
  totalMinutes: number;
  /** Number of completed sessions. */
  sessionsCompleted: number;
  /** Sessions cut short. */
  sessionsAbandoned: number;
  /** Current run streak: consecutive days with at least one completed pomodoro. */
  streakDays: number;
  /** Today's minute count. */
  todayMinutes: number;
}

export interface PomodoroSessionWithTask extends PomodoroSession {
  taskTitle?: string | null;
}