import type { ID } from './index';

/** One day in a review period. Powers the planned-vs-actual strip. */
export interface ReviewDay {
  date: string;
  plannedMinutes: number;
  availableMinutes: number;
  /** Focus actually recorded that day. */
  focusMinutes: number;
  /** Estimates of tasks completed that day. */
  completedMinutes: number;
  tasksPlanned: number;
  tasksCompleted: number;
  overCapacity: boolean;
}

export interface PeriodStats {
  plannedMinutes: number;
  /** Focus time spent on work that was planned for this period. */
  completedMinutes: number;
  focusMinutes: number;
  sessionsCompleted: number;
  sessionsAbandoned: number;
  tasksPlanned: number;
  tasksCompleted: number;
  /** Planned work that was moved to a later day instead of done. */
  rescheduledMinutes: number;
  /** Days where planned work exceeded usable time. */
  overloadedDays: number;
  /** tasksCompleted / tasksPlanned, 0 when nothing was planned. */
  completionRate: number;
  /** Focus minutes by hour of day, 24 entries, for the rhythm chart. */
  focusByHour: { hour: number; minutes: number }[];
  /** Estimate-vs-actual ratio per course. Only courses with a real sample. */
  accuracy: CourseAccuracy[];
}

export interface CourseAccuracy {
  courseId: ID;
  courseName: string;
  estimatedMinutes: number;
  actualMinutes: number;
  /** actual / estimated. >1 means this work consistently takes longer. */
  ratio: number;
  samples: number;
}

export type PatternKind =
  | 'underestimate'
  | 'best_hour'
  | 'postponement'
  | 'overload'
  | 'abandonment'
  | 'steady';

export interface Pattern {
  id: string;
  kind: PatternKind;
  /** Stated as an observation about behaviour, never as a judgement. */
  title: string;
  detail: string;
  /** 0..1 — how much evidence backs this. */
  confidence: number;
  /** Number of observations behind the claim. */
  samples: number;
}

export interface ReviewReport {
  period: 'day' | 'week';
  from: string;
  to: string;
  stats: PeriodStats;
  patterns: Pattern[];
  days: ReviewDay[];
  serverNow: string;
}
