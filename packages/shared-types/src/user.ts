import type { ID } from './index';

export type UserRole = 'USER';

export interface User {
  id: ID;
  email: string;
  name: string;
  createdAt: string;
}

/** Fields stored server-side only — never sent to clients. */
export interface UserCredentials {
  id: ID;
  email: string;
  passwordHash: string;
  createdAt: string;
  attendanceAutoMarkHours: number | null;
  pomodoroWorkMinutes: number | null;
  pomodoroBreakMinutes: number | null;
  pomodoroLongBreakMinutes: number | null;
  pomodoroSessionsPerCycle: number | null;
  chimeOnTheHour: boolean;
  googleRefreshToken: string | null;
  googleAccessToken: string | null;
  googleTokenExpiresAt: string | null;
  onboardingComplete: boolean;
  /** FCM registration token for Android push (attendance prompts). */
  fcmToken: string | null;
  dayStartMinutes: number | null;
  dayEndMinutes: number | null;
  bufferMinutes: number | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateUserRequest {
  name?: string;
  attendanceAutoMarkHours?: number | null;
  pomodoroWorkMinutes?: number;
  pomodoroBreakMinutes?: number;
  pomodoroLongBreakMinutes?: number;
  pomodoroSessionsPerCycle?: number;
  chimeOnTheHour?: boolean;
  /** Endpoint only — client sends the new FCM token. */
  fcmToken?: string | null;
  onboardingComplete?: boolean;
}

export interface AttendanceSettings {
  /** How many hours before an UNCONFIRMED record auto-marks. null = stay unconfirmed forever. */
  attendanceAutoMarkHours: number | null;
}

export interface PomodoroSettings {
  pomodoroWorkMinutes: number;
  pomodoroBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  pomodoroSessionsPerCycle: number;
}

export interface ChimeSettings {
  chimeOnTheHour: boolean;
}

/**
 * The awake window and transition buffer. These three numbers decide every
 * capacity verdict the app gives, so they are a first-class setting rather
 * than a hidden constant.
 */
export interface CapacitySettings {
  /** Minutes from local midnight. null = unset, default applied server-side. */
  dayStartMinutes: number | null;
  dayEndMinutes: number | null;
  bufferMinutes: number | null;
}

/**
 * One linked Google account. A user can link several: each keeps its own
 * calendars and task lists, and all of them feed the same day model.
 */
export interface GoogleConnectionInfo {
  id: ID;
  email: string;
  displayName: string | null;
  /**
   * Set when the grant can no longer be refreshed and the account has to be
   * linked again by hand. This happens routinely in Google OAuth "Testing"
   * mode, where refresh tokens expire after seven days.
   */
  needsRelink: boolean;
  lastSyncedAt: string | null;
  /** Only reported while `needsRelink` is set, to keep the list calm. */
  lastError: string | null;
  calendarCount: number;
  createdAt: string;
}
