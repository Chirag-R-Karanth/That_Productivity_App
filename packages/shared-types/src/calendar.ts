import type { ID } from './index';

export type CalendarEventSource = 'LOCAL' | 'GOOGLE';

export interface CalendarEvent {
  id: ID;
  userId: ID;
  source: CalendarEventSource;
  /** ID of the connected Google calendar this event came from (GOOGLE only). */
  sourceCalendarId: ID | null;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string | null;
  color: string | null;
  /** True when this event matched another calendar's event and was merged away. */
  isDedupedDuplicate: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarEventRequest {
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  location?: string | null;
  color?: string | null;
}

export interface UpdateCalendarEventRequest {
  title?: string;
  description?: string | null;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string | null;
  color?: string | null;
}

export interface LinkedCalendar {
  id: ID;
  summary: string;
  /** google/user-visible color — may be null. */
  backgroundColor: string | null;
  /**
   * Whether this calendar's events count as planned time. A calendar can stay
   * linked and synced while being kept out of the day model.
   */
  includeInDay: boolean;
  /**
   * The Google account this calendar belongs to. A Google calendar id is only
   * unique within its own account — every account has a `primary` — so this is
   * required to address the calendar in any request.
   */
  connectionId: ID;
  /** Convenience for display; the account a calendar came from. */
  accountEmail: string | null;
  accountName: string | null;
}

export interface UpdateLinkedCalendarRequest {
  includeInDay?: boolean;
}

export interface SyncCalendarFailure {
  connectionId: ID;
  error: string;
}

export interface SyncCalendarResult {
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  /**
   * Events stored as copies of a meeting already seen from another account.
   * They are kept so that disconnecting one account does not silently delete
   * a meeting, and hidden from the day by dedup.
   */
  mergedDuplicates: number;
  /** Accounts that synced successfully in this run. */
  accountsSynced: number;
  /**
   * Accounts that failed. Sync continues past a failure, so this is how the user
   * learns that one of their accounts needs attention rather than seeing a sync
   * that looks like it simply found nothing.
   */
  accountsFailed: number;
  failures: SyncCalendarFailure[];
}

export interface CalendarDay {
  date: string;
  events: CalendarEvent[];
}

/** Used for time-window overlap matching across calendars. */
export interface DedupMatch {
  base: CalendarEvent;
  duplicate: CalendarEvent;
  /** How confident the merge is (0..1). */
  confidence: number;
}

/**
 * A calendar event as presented, after same-title/same-time copies from other
 * calendars have been folded together.
 */
export interface PresentedEvent extends CalendarEvent {
  /**
   * Other calendars this same event also appears on. Empty when it is unique.
   * Folding happens when the view is built and never modifies the stored row,
   * so `googleEventId` and `sourceCalendarId` still say where it came from.
   */
  alsoOn: { calendarId: ID; calendarSummary: string }[];
}