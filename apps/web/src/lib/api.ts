import type { ApiResult, ApiErrorEnvelope, ApiEnvelope } from "@prodapp/shared-types";
import { pushAction } from "@/lib/offlineQueue";

// Empty string → same-origin `/api/...` (used in the Docker/nginx deployment);
// set NEXT_PUBLIC_API_URL at build time for cross-origin API servers.
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();

let authToken: string | null =
  typeof window !== "undefined" ? localStorage.getItem("token") : null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

const MUTATING = ["POST", "PUT", "PATCH", "DELETE"];
const REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  // A per-request idempotency key lets offline replays avoid double-applying.
  const idempotencyKey = ["POST", "PUT", "PATCH"].includes(method) ? crypto.randomUUID() : undefined;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    // Offline (or unreachable): queue mutations for replay so nothing is lost.
    if (MUTATING.includes(method)) {
      try {
        await pushAction({ method, path, body, idempotencyKey });
        return { ok: true, data: { queued: true } as unknown as T };
      } catch {
        // Queue unavailable — surface the failure to the caller.
      }
    }
    throw Object.assign(new Error("You appear to be offline."), {
      code: "NETWORK_ERROR",
    });
  } finally {
    clearTimeout(timer);
  }

  const json = (await res.json().catch(() => null)) as
    | ApiEnvelope<T>
    | ApiErrorEnvelope
    | null;

  if (!res.ok || !json || !("ok" in json) || json.ok !== true) {
    const err = (json as ApiErrorEnvelope | null)?.error ?? {
      code: "NETWORK_ERROR",
      message: `Request failed (${res.status})`,
    };
    throw Object.assign(new Error(err.message), { code: err.code, details: err.details });
  }

  return json;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  /** Used to replay an offline-queued action with its original idempotency key. */
  requestFromQueue: async <T>(action: {
    method: string;
    path: string;
    body?: unknown;
    key: string;
    idempotencyKey?: string;
  }): Promise<ApiResult<T>> => {
    const headers: Record<string, string> = {
      "Idempotency-Key": action.idempotencyKey ?? action.key,
    };
    if (action.body !== undefined) headers["Content-Type"] = "application/json";
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(`${API_BASE}${action.path}`, {
      method: action.method,
      headers,
      body: action.body !== undefined ? JSON.stringify(action.body) : undefined,
    });

    const json = (await res.json().catch(() => null)) as ApiResult<T> | null;
    if (json && "ok" in json && json.ok !== true) {
      throw new Error(json.error.message);
    }
    return (json ?? { ok: false, error: { code: "NETWORK_ERROR", message: "No response" } }) as ApiResult<T>;
  },
};