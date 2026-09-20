// Google Calendar sync helpers. Zero-dependency: uses global fetch against
// Google's OAuth2 + Calendar REST APIs (Node 22+).

import { env } from "../lib/env.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Read-only access is all the app needs — Google writes stay user-side.
export const GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function googleConfigured(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret && env.googleRedirectUri);
}

export function encodeState(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeState<T>(state: string): T {
  const json = Buffer.from(state, "base64url").toString("utf8");
  return JSON.parse(json) as T;
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> {
  const body = new URLSearchParams({
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: env.googleRedirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as TokenResponse;
  if (!data.refresh_token) {
    throw new Error("Google returned no refresh token (prompt=consent should have forced it)");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status})`);
  }
  return (await res.json()) as TokenResponse;
}

interface GoogleUserRow {
  id: string;
  googleAccessToken: string | null;
  googleRefreshToken: string | null;
  googleTokenExpiresAt: Date | null;
}

// Return a valid access token, refreshing and persisting when expired or absent.
export async function ensureAccessToken(
  user: GoogleUserRow,
  updateStored: (data: { googleAccessToken: string; googleTokenExpiresAt: Date }) => Promise<unknown>,
): Promise<string> {
  const now = Date.now();
  if (
    user.googleAccessToken &&
    user.googleTokenExpiresAt &&
    new Date(user.googleTokenExpiresAt).getTime() > now + 60_000
  ) {
    return user.googleAccessToken;
  }
  if (!user.googleRefreshToken) {
    throw new Error("No Google refresh token stored");
  }
  const t = await refreshAccessToken(user.googleRefreshToken);
  const expiresAt = new Date(now + t.expires_in * 1000);
  await updateStored({ googleAccessToken: t.access_token, googleTokenExpiresAt: expiresAt });
  return t.access_token;
}

async function gcal<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Google Calendar API error ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  backgroundColor?: string | null;
  accessRole?: string | null;
}

export function listCalendars(accessToken: string): Promise<{ items: GoogleCalendarListItem[] }> {
  return gcal("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100", accessToken);
}

export interface GoogleCalendarEventItem {
  id: string;
  status?: string;
  summary?: string;
  description?: string | null;
  location?: string | null;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  colorId?: string;
}

export function getEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<{ items: GoogleCalendarEventItem[] }> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: "2500",
    singleEvents: "true",
    orderBy: "startTime",
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  return gcal(url, accessToken);
}

/** Google's default per-calendar color palette (index → hex). */
const GCAL_COLORS: Record<string, string> = {
  "0": "#7986cb", "1": "#33b679", "2": "#8e24aa", "3": "#e67c73",
  "4": "#f6bf26", "5": "#f4511e", "6": "#039be5", "7": "#c0ca33",
  "8": "#616161", "9": "#33b679", "10": "#7986cb",
};

export function gcalColor(colorId?: string): string {
  return colorId ? GCAL_COLORS[colorId] ?? "#8fb0ff" : "#8fb0ff";
}