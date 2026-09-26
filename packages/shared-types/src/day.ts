import type { ID } from './index';
import type { Task } from './task';

/** Where the current moment sits in the arc of a day. Drives tone, not logic. */
export type DayPhase = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

export type TimelineKind = 'class' | 'event' | 'focus' | 'deadline' | 'plan' | 'gap';

export type TimelineSource = 'TIMETABLE' | 'LOCAL' | 'GOOGLE' | 'FOCUS' | 'TASK';

/**
 * One entry on the unified day timeline. Every commitment in the app is
 * projected into this single shape — classes, Google events, local events,
 * focus blocks, task deadlines and planned work — so the UI renders one
 * ordered stream rather than several competing lists.
 */
export interface TimelineBlock {
  /** Stable across refreshes so the list animates instead of snapping. */
  key: string;
  kind: TimelineKind;
  title: string;
  /** Minutes from local midnight. Null for markers with no duration. */
  startMinutes: number | null;
  endMinutes: number | null;
  durationMinutes: number | null;
  isNow: boolean;
  isPast: boolean;
  color: string | null;
  meta: string | null;
  taskId: ID | null;
  courseId: ID | null;
  source: TimelineSource | null;
}

/** A usable stretch of the day with no commitment in it. */
export interface FreeBlock {
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

/**
 * open     — nothing planned, or planned work far below capacity
 * light    — comfortable margin
 * balanced — the day is fully spoken for, and it works
 * tight    — planned work exceeds usable time, but only just
 * over     — the day does not fit. Something has to move.
 */
export type CapacityVerdict = 'open' | 'light' | 'balanced' | 'tight' | 'over';

export interface Capacity {
  windowStartMinutes: number;
  windowEndMinutes: number;
  /** Classes + events, clipped to the window. */
  fixedMinutes: number;
  fixedCount: number;
  /**
   * The honest number: the awake window minus every commitment minus the
   * transition buffer around each one. This is deliberately *not*
   * `window - fixedMinutes`, because a 10-minute gap between two classes is
   * not 10 minutes of usable work.
   */
  availableMinutes: number;
  /** Free blocks that have not started yet. Today only; 0 for past days. */
  remainingMinutes: number;
  /** Sum of task estimates planned for this day. */
  plannedMinutes: number;
  /** available - planned. Negative means the day does not fit. */
  deltaMinutes: number;
  verdict: CapacityVerdict;
  /** One sentence, written for a human. */
  headline: string;
}

export interface DayProgress {
  tasksPlanned: number;
  tasksDone: number;
  /** Estimates belonging to tasks completed on this day. */
  completedMinutes: number;
  focusMinutes: number;
  focusSessions: number;
}

export interface DayModel {
  /** YYYY-MM-DD, local. */
  date: string;
  phase: DayPhase;
  capacity: Capacity;
  timeline: TimelineBlock[];
  free: FreeBlock[];
  progress: DayProgress;
  /** Tasks with plannedDate === date. */
  planned: Task[];
  /**
   * Due on or before this date, not completed, and not planned on any day.
   * These are deadlines with no time reserved for them — the most common way
   * a plan quietly fails.
   */
  unplanned: Task[];
  serverNow: string;
}

export type DisplacementRisk = 'safe' | 'tight' | 'blocked';

/**
 * A task that no longer fits, with somewhere for it to go. The server never
 * moves anything itself — it reports the consequence and lets the user decide.
 */
export interface Displacement {
  task: Task;
  estimateMinutes: number;
  risk: DisplacementRisk;
  reason: string;
  suggestedDate: string | null;
  suggestedFreeMinutes: number;
}
