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
}

export interface SyncCalendarResult {
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  mergedDuplicates: number;
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