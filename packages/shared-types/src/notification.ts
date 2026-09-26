import type { ID } from './index';

/**
 * The four things this app can interrupt you for.
 *
 * Split by what the user would want to silence separately, not by transport: a
 * person who never wants to hear about a pomodoro still wants to be asked
 * whether they attended class.
 */
export type NotificationChannel = 'attendance' | 'calendar' | 'tasks' | 'focus';

export interface NotificationPreferences {
  notifyAttendance: boolean;
  notifyCalendar: boolean;
  notifyTasks: boolean;
  notifyFocus: boolean;
}

/**
 * Whether this server can send Web Push at all, and the public half of its
 * VAPID key pair.
 *
 * `reason` is the explanation a person can act on — an unset key pair is their
 * administrator's job, not theirs — so the client shows it instead of a toggle
 * that silently does nothing.
 */
export interface PushStatus {
  configured: boolean;
  /** Null when unconfigured. Public key: safe to hand to a browser. */
  publicKey: string | null;
  reason: string | null;
}

/**
 * One browser registered to receive push for this account.
 *
 * The endpoint itself is never sent to the client — it is the address the push
 * service delivers to, and there is no reason for the browser to read it back
 * from us rather than keeping the copy it already has.
 */
export interface PushSubscriptionInfo {
  id: ID;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  /** A subscription whose last delivery failed. Reported, never auto-removed. */
  failing: boolean;
  lastError: string | null;
}

/** A Web Push subscription as the browser reports it. */
export interface SubscribeRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * The notification feed behind the desktop bell.
 *
 * Two kinds of thing, because they want different things from the reader: a
 * record that is still waiting on an answer, and activity that has already
 * happened. Only the first is still actionable.
 */
export interface NotificationFeed {
  events: ActivityEvent[];
  /** Attendance records nobody has answered yet. */
  pendingAttendance: PendingAttendancePrompt[];
}

export interface ActivityEvent {
  id: ID;
  type: string;
  title: string;
  occurredAt: string;
  /** Where this event happened, so the bell can link rather than just report. */
  url: string;
}

export interface PendingAttendancePrompt {
  recordId: ID;
  courseId: ID;
  courseName: string;
  date: string;
  /** True once a push has already gone out for this record. */
  prompted: boolean;
}
