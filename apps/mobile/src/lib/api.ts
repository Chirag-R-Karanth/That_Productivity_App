// Set EXPO_PUBLIC_API_URL at bundle time (e.g. your dev machine's LAN IP or the
// deployed backend). Defaults to the local backend for simulator/emulator use.
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

class ApiError extends Error {
  code?: string;
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function isOnline(): boolean {
  return true; // replaced by NetInfo in a later phase; fetch will surface errors
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new ApiError("Network error — are you online and is the backend running?");
    err.code = "NETWORK_ERROR";
    throw err;
  }

  const json = (await res.json().catch(() => null)) as
    | { ok: boolean; data?: T; error?: { code: string; message: string } }
    | null;

  if (!res.ok || !json || !("ok" in json) || json.ok !== true) {
    const err = new ApiError(json?.error?.message ?? `Request failed (${res.status})`);
    err.code = json?.error?.code ?? "UNKNOWN";
    throw err;
  }

  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};