// Google Calendar and Tasks sync helpers. Zero-dependency: uses global fetch
// against Google's OAuth2 + Calendar + Tasks REST APIs (Node 22+).

import { env } from "../lib/env.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";
const TASKS_BASE = "https://tasks.googleapis.com/tasks/v1";

/**
 * Requested scopes.
 *
 * Calendar stays read-only: the app never writes to Google Calendar.
 * Tasks is the full `tasks` scope because the user chose two-way sync, and that
 * makes it a *sensitive* scope. A sensitive scope has consequences outside this
 * codebase: publishing the consent screen to "In production" requires Google's
 * verification review, and leaving it in "Testing" caps refresh-token lifetime
 * at 7 days. See `googleConnectionNeedsRelink` for how an expiry is handled.
 */
export const GOOGLE_SCOPES = [
  // The account's own identity, so a connection row can be keyed on Google's
  // stable account id and the settings screen can name the account. The userinfo
  // endpoint is the OpenID Connect one, which rejects a token that carries
  // neither `openid` nor an email scope -- so these are not optional extras, the
  // link fails without them. All three are non-sensitive.
  "openid",
  "profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/tasks",
].join(" ");

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * A Google call failed in a way that matters to the caller.
 *
 * `tokenInvalid` is separated out because it is the one failure a retry cannot
 * fix: the grant was revoked or has expired, and a human has to reconnect. It is
 * flagged on the connection so every screen can offer a reconnect button rather
 * than silently retrying and failing.
 */
export class GoogleApiError extends Error {
  readonly status: number;
  readonly tokenInvalid: boolean;

  constructor(message: string, status: number, tokenInvalid: boolean) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.tokenInvalid = tokenInvalid;
  }
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    // offline so a refresh token comes back, and consent so a second account can
    // be authorised: without it Google silently re-authorises the last one and
    // the "link another account" button appears to do nothing.
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
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string | null;
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
  const t = (await res.json()) as TokenResponse;
  if (!res.ok || !t.access_token) {
    throw new GoogleApiError(
      `Google token exchange failed: ${t.error_description ?? t.error ?? res.status}`,
      res.status,
      // A reused or expired authorization code lands here, and it is fixed by
      // sending the user through the consent screen again.
      t.error === "invalid_grant",
    );
  }
  return {
    accessToken: t.access_token,
    // Absent when the grant was incremental: Google only issues a refresh token
    // the first time. Keeping the old one is correct in that case.
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    scopes: t.scope ?? null,
  };
}

/** Google's identity for an access token: the stable per-account id and email. */
export interface GoogleIdentity {
  /** The `sub` claim. Stable for the life of the account; the email is not. */
  sub: string;
  email: string;
  name: string | null;
}

export async function fetchGoogleIdentity(accessToken: string): Promise<GoogleIdentity> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new GoogleApiError(
      `Google userinfo failed: ${await res.text()}`,
      res.status,
      res.status === 401,
    );
  }
  const body = (await res.json()) as { sub?: string; email?: string; name?: string };
  if (!body.sub || !body.email) {
    throw new GoogleApiError("Google returned no account identity", 502, false);
  }
  return { sub: body.sub, email: body.email, name: body.name ?? null };
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
  const t = (await res.json()) as TokenResponse;
  if (!res.ok || !t.access_token) {
    throw new GoogleApiError(
      `Google token refresh failed: ${t.error_description ?? t.error ?? res.status}`,
      res.status,
      // invalid_grant here means the grant is gone for good: revoked, or the
      // 7-day Testing-mode expiry. No retry can recover it.
      t.error === "invalid_grant",
    );
  }
  return t;
}

/** The parts of a connection row that token handling needs. */
export interface GoogleConnectionRow {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

/**
 * A valid access token for this connection, refreshing and persisting when it is
 * expired or absent.
 *
 * A token that Google refuses is not thrown at the caller as a generic failure:
 * `markNeedsRelink` is given the chance to record it, so the next sync skips
 * this account instead of hammering a dead grant, and the UI can offer a
 * reconnect. The error is still raised so the current sync reports the truth.
 */
export async function ensureConnectionAccessToken(
  connection: GoogleConnectionRow,
  persist: (data: { accessToken: string; tokenExpiresAt: Date }) => Promise<unknown>,
  markNeedsRelink: (reason: string) => Promise<unknown>,
): Promise<string> {
  const now = Date.now();
  if (
    connection.accessToken &&
    connection.tokenExpiresAt &&
    new Date(connection.tokenExpiresAt).getTime() > now + 60_000
  ) {
    return connection.accessToken;
  }
  if (!connection.refreshToken) {
    await markNeedsRelink("No refresh token stored");
    throw new GoogleApiError("No Google refresh token stored", 401, true);
  }
  let t: TokenResponse;
  try {
    t = await refreshAccessToken(connection.refreshToken);
  } catch (e) {
    if (e instanceof GoogleApiError && e.tokenInvalid) await markNeedsRelink(e.message);
    throw e;
  }
  const expiresAt = new Date(now + t.expires_in * 1000);
  await persist({ accessToken: t.access_token, tokenExpiresAt: expiresAt });
  return t.access_token;
}

/** A Google REST call. `url` is always the URL and never the token. */
async function googleFetch<T>(
  accessToken: string,
  url: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new GoogleApiError(
      `Google API error ${res.status} for ${url}: ${text}`,
      res.status,
      res.status === 401,
    );
  }
  // 204 and some deletes have no body to parse.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  backgroundColor?: string | null;
  accessRole?: string | null;
}

export function listCalendars(accessToken: string): Promise<{ items?: GoogleCalendarListItem[] }> {
  return googleFetch(accessToken, `${CAL_BASE}/users/me/calendarList?maxResults=100`);
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
  updated?: string;
}

export function getEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<{ items?: GoogleCalendarEventItem[] }> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: "2500",
    singleEvents: "true",
    orderBy: "startTime",
  });
  const url = `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  return googleFetch(accessToken, url);
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

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string | null;
  status?: "needsAction" | "completed";
  /** RFC3339, or a bare date for an all-day due date. */
  due?: string;
  completed?: string;
  deleted?: boolean;
  hidden?: boolean;
  parent?: string | null;
  position?: string;
  etag?: string;
  selfLink?: string;
  updated?: string;
}

export function listTaskLists(accessToken: string): Promise<{ items?: GoogleTaskList[] }> {
  return googleFetch(accessToken, `${TASKS_BASE}/users/@me/lists`);
}

/**
 * Tasks in a list, including completed and hidden ones.
 *
 * `showCompleted` and `showHidden` matter for a two-way sync: without them a task
 * completed in Google stays "pending" in the app forever, and a task the user
 * completed and then undid disappears from the sync entirely.
 */
export function listTasks(
  accessToken: string,
  taskListId: string,
  opts: { maxResults?: number; showCompleted?: boolean; showHidden?: boolean } = {},
): Promise<{ items?: GoogleTask[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    maxResults: String(opts.maxResults ?? 2500),
    showCompleted: String(opts.showCompleted ?? true),
    showHidden: String(opts.showHidden ?? true),
  });
  return googleFetch(
    accessToken,
    `${TASKS_BASE}/lists/${encodeURIComponent(taskListId)}/tasks?${params}`,
  );
}

export function getTask(
  accessToken: string,
  taskListId: string,
  taskId: string,
): Promise<GoogleTask> {
  return googleFetch(
    accessToken,
    `${TASKS_BASE}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
  );
}

/**
 * Create a task in a list. `previous` is the id of the task to insert after,
 * which is how a new task is ordered rather than appended.
 */
export function insertTask(
  accessToken: string,
  taskListId: string,
  task: { title: string; notes?: string | null; due?: string; status?: string; previous?: string },
): Promise<GoogleTask> {
  return googleFetch(
    accessToken,
    `${TASKS_BASE}/lists/${encodeURIComponent(taskListId)}/tasks`,
    {
      method: "POST",
      body: {
        title: task.title,
        notes: task.notes ?? undefined,
        due: task.due,
        status: task.status,
        ...(task.previous ? { previous: task.previous } : {}),
      },
    },
  );
}

/**
 * Patch a task in place.
 *
 * `etag` is passed as `If-Match`. Google answers 412 if the task changed since
 * it was read, and overwriting a change the user made in the Google Tasks app
 * would silently destroy it, so the caller is expected to re-read and retry
 * rather than force.
 */
export function patchTask(
  accessToken: string,
  taskListId: string,
  taskId: string,
  patch: { title?: string; notes?: string | null; due?: string; status?: string; deleted?: boolean },
  etag?: string | null,
): Promise<GoogleTask> {
  return googleFetch(
    accessToken,
    `${TASKS_BASE}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: patch,
      ...(etag ? { headers: { "If-Match": etag } } : {}),
    },
  );
}

export function deleteTask(
  accessToken: string,
  taskListId: string,
  taskId: string,
): Promise<void> {
  return googleFetch(
    accessToken,
    `${TASKS_BASE}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );
}
