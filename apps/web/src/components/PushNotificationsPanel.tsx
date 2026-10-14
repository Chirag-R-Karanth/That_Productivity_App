"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PushSubscriptionInfo } from "@prodapp/shared-types";
import {
  disablePush,
  enablePush,
  fetchPushStatus,
  removeRemoteSubscription,
  resolvePushState,
  sendTestPush,
  type PushState,
} from "@/lib/push";

/**
 * What each state means for the person reading it.
 *
 * Every one of these is a dead end the user can do something about *except*
 * `server-unconfigured`, which is an administrator's job — so that one names
 * the variable rather than offering a button.
 */
const COPY: Record<PushState, { title: string; body: string }> = {
  unsupported: {
    title: "This browser can't receive notifications",
    body: "Push notifications need a browser with the Push API and a service worker. Everything else in the app still works, and the bell icon still shows what needs your attention.",
  },
  "server-unconfigured": {
    title: "Notifications aren't set up on this server",
    body: "An administrator has to add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to the environment and restart the backend. Nothing is wrong with your browser.",
  },
  default: {
    title: "Notifications are off",
    body: "Turn them on to be asked whether you attended a class once it has finished — while you still know the answer. Nothing is sent to this device until you allow it.",
  },
  denied: {
    title: "Your browser is blocking notifications",
    body: "Permission was refused, and only your browser can undo that. Re-allow notifications for this site in its address-bar settings, then come back and turn them on.",
  },
  "granted-unsubscribed": {
    title: "Permission granted, nothing registered",
    body: "This browser is allowed to notify you but isn't registered with the server. Turning notifications on will finish the job.",
  },
  subscribed: {
    title: "Notifications are on",
    body: "This browser is registered. Turn them off here to stop every device at once, or below to stop just one.",
  },
};

export function PushNotificationsPanel({ onChanged }: { onChanged?: () => void }) {
  const [state, setState] = useState<PushState | null>(null);
  const [serverReason, setServerReason] = useState<string | null>(null);
  const [subs, setSubs] = useState<PushSubscriptionInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [next, status, list] = await Promise.all([
      resolvePushState(),
      fetchPushStatus(),
      api.get<PushSubscriptionInfo[]>("/api/notifications/push/subscriptions"),
    ]);
    setState(next);
    setServerReason(status.reason);
    if ("ok" in list && list.ok) setSubs(list.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (state === "subscribed" || state === "granted-unsubscribed") {
        const result = await disablePush();
        setMessage(result.ok ? "Notifications are off for this browser." : result.reason ?? null);
      } else {
        const result = await enablePush();
        setMessage(
          result.ok ? "Notifications are on for this browser." : result.reason,
        );
      }
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const test = async (id?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendTestPush(id);
      setMessage(
        result.ok
          ? result.sent > 0
            ? "Test notification sent — it should appear within a few seconds."
            : "The server accepted the request, but no browser was registered for it."
          : result.reason,
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const forget = async (sub: PushSubscriptionInfo) => {
    setBusy(true);
    try {
      await removeRemoteSubscription(sub.id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (state === null) {
    return <p className="text-xs text-text-muted">Checking this browser…</p>;
  }

  const copy = COPY[state];
  const canToggle = state !== "unsupported" && state !== "server-unconfigured" && state !== "denied";
  const on = state === "subscribed";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-elevated px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">{copy.title}</p>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-text-muted">
              {state === "server-unconfigured" && serverReason ? serverReason : copy.body}
            </p>
          </div>
          {canToggle && (
            <button
              onClick={() => void toggle()}
              disabled={busy}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                on
                  ? "bg-surface-elevated text-text-muted hover:bg-border"
                  : "bg-accent text-white hover:bg-accent-hover"
              }`}
            >
              {busy ? "…" : on ? "Turn off" : "Turn on"}
            </button>
          )}
        </div>
      </div>

      {message && (
        <p className="rounded-lg border border-border bg-surface px-4 py-2.5 text-xs text-text">
          {message}
        </p>
      )}

      {on && (
        <button
          onClick={() => void test()}
          disabled={busy}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
        >
          Send a test notification
        </button>
      )}

      {subs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-text-muted">
            Browsers registered to this account. Removing one stops only that device.
          </p>
          {subs.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface-elevated px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-text">{describeAgent(s.userAgent)}</p>
                <p className="truncate text-[11px] text-text-muted">
                  Added {new Date(s.createdAt).toLocaleString()}
                  {s.lastUsedAt
                    ? ` · last delivery ${new Date(s.lastUsedAt).toLocaleString()}`
                    : " · no delivery yet"}
                  {s.failing ? " · last delivery failed" : ""}
                </p>
              </div>
              <button
                onClick={() => void forget(s)}
                disabled={busy}
                className="shrink-0 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface hover:text-danger disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A service worker user-agent string is long and identical across every browser
 * of the same build, so it is trimmed to the part that tells devices apart.
 */
function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown browser";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  const platform =
    /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : null;
  return platform ? `${browser} on ${platform}` : browser;
}
