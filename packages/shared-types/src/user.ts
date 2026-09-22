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