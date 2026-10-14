"use client";

/**
 * Browser-side Web Push.
 *
 * Everything here is best-effort by design. Push notification support is
 * uneven across browsers, permission can be denied and never re-granted, and a
 * subscription can go stale without telling anyone. None of that is worth an
 * error dialog: what matters is that the app never claims notifications work
 * when they might not, and never leaves a subscription registered for an
 * account that has turned notifications off.
 */
import { api } from "./api";
import type { PushStatus, SubscribeRequest } from "@prodapp/shared-types";

/** Why notifications are not currently on, in words a person can act on. */
export type PushState =
  /** This browser cannot do Web Push at all. */
  | "unsupported"
  /** The server has no VAPID keys, so nobody could subscribe. */
  | "server-unconfigured"
  /** The user has not been asked yet. */
  | "default"
  /** Asked and refused. Only the browser can undo this. */
  | "denied"
  /** Asked and allowed, but not yet registered with the server. */
  | "granted-unsubscribed"
  /** Working. */
  | "subscribed";

/** Bytes of a VAPID public key, which is always an uncompressed P-256 point. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function permissionState(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

export async function fetchPushStatus(): Promise<PushStatus> {
  try {
    const res = await api.get<PushStatus>("/api/notifications/push/status");
    if (!("ok" in res) || !res.ok) {
      return { configured: false, publicKey: null, reason: "Couldn't reach the server." };
    }
    return res.data;
  } catch {
    return { configured: false, publicKey: null, reason: "Couldn't reach the server." };
  }
}

/** The subscription this browser already holds, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Ask for permission and register this browser for push.
 *
 * The permission prompt is only ever shown as a direct result of the user
 * pressing the button — a page that asks on load gets a permanent "denied" and
 * no way back.
 */
export async function enablePush(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (!pushSupported()) {
    return { ok: false, reason: "This browser can't receive push notifications." };
  }

  const status = await fetchPushStatus();
  if (!status.configured || !status.publicKey) {
    return {
      ok: false,
      reason: status.reason ?? "Push notifications aren't set up on this server.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason:
        permission === "denied"
          ? "Your browser is blocking notifications for this site. Re-allow them in site settings, then try again."
          : "No permission was granted, so nothing was subscribed.",
    };
  }

  const reg = await navigator.serviceWorker.ready;
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(status.publicKey) as BufferSource,
    }));

  const json = subscription.toJSON() as SubscribeRequest;
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "The browser returned an incomplete subscription." };
  }

  try {
    await api.post("/api/notifications/push/subscriptions", {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch (err) {
    // The local subscription exists but the server does not know about it, so
    // nothing will ever be delivered. Undo it rather than leave the browser
    // claiming to be subscribed.
    await subscription.unsubscribe().catch(() => {});
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "The server rejected the subscription.",
    };
  }

  return { ok: true };
}

/**
 * Stop this browser receiving push.
 *
 * Both halves matter: the local subscription is unsubscribed, and the server
 * row is deleted. Dropping only the local one leaves an address the server
 * keeps pushing to, which is exactly the failure this is meant to end.
 */
export async function disablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: true };
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  const endpoint = subscription?.endpoint;

  if (subscription) await subscription.unsubscribe().catch(() => {});

  try {
    await api.delete("/api/notifications/push/subscriptions", { endpoint });
  } catch (err) {
    return {
      ok: false,
      reason:
        (err instanceof Error ? err.message : "") +
        " This browser is unsubscribed, but the server still holds its address.",
    };
  }
  return { ok: true };
}

/** Ask the server to send a test message to one of this account's browsers. */
export async function sendTestPush(id?: string): Promise<
  { ok: true; sent: number } | { ok: false; reason: string }
> {
  try {
    const res = await api.post<{ sent: number; failed: number }>(
      "/api/notifications/push/test",
      id ? { id } : {},
    );
    if (!("ok" in res) || !res.ok) {
      return { ok: false, reason: "The server couldn't send a test notification." };
    }
    return { ok: true, sent: res.data.sent };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "The server couldn't send a test notification.",
    };
  }
}

/** Remove one of this account's registered browsers, addressed by row id. */
export async function removeRemoteSubscription(id: string): Promise<boolean> {
  try {
    await api.delete("/api/notifications/push/subscriptions", { id });
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-register whatever subscription this browser currently holds.
 *
 * Called when the browser invalidates a subscription behind our back. It
 * never asks for permission and never creates a subscription — both of those
 * are the user's decision, and a background repair that can prompt for them
 * would be indistinguishable from harassment. If the browser has quietly issued
 * a new subscription, this hands the new address to the server; if it has not,
 * there is nothing to do and Settings still says so.
 */
export async function reregisterPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const subscription = await currentSubscription();
  if (!subscription) return false;
  const json = subscription.toJSON() as SubscribeRequest;
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  try {
    await api.post("/api/notifications/push/subscriptions", {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    return true;
  } catch {
    return false;
  }
}

/** The single state the Notifications tab renders from. */
export async function resolvePushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const status = await fetchPushStatus();
  if (!status.configured) return "server-unconfigured";
  const permission = Notification.permission;
  if (permission === "denied") return "denied";
  const subscription = await currentSubscription();
  if (!subscription) return permission === "granted" ? "granted-unsubscribed" : "default";
  return "subscribed";
}
