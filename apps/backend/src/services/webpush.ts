/**
 * Web Push delivery, signed with VAPID.
 *
 * The browser holds the subscription (an endpoint plus two keys) and the
 * push service — not us — is the one that actually wakes a device. What this
 * module owns is the half that is easy to get quietly wrong:
 *
 *  - signing correctly, once, and never blocking a request on a missing key;
 *  - telling "this browser is gone" apart from "the network hiccupped", so a
 *    dead subscription is deleted instead of retried forever;
 *  - never letting a push failure fail the action that caused it. A user
 *    resolving their own attendance must get their answer saved whether or not
 *    their phone happens to be online.
 */
import webPush from "web-push";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";

/** Is this server able to send push at all? */
export function pushConfigured(): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey);
}

/**
 * The public half of the VAPID pair, which the browser needs in order to
 * subscribe. Null when unconfigured, so the client can say so plainly rather
 * than offering a button that cannot work.
 */
export function vapidPublicKey(): string | null {
  return pushConfigured() ? env.vapidPublicKey : null;
}

let configured = false;

/**
 * `setVapidDetails` is process-global and throws on a malformed subject, so it
 * is done at most once and its failure is remembered rather than retried on
 * every notification.
 */
let vapidError: string | null = null;

function ensureVapid(): boolean {
  if (!pushConfigured()) return false;
  if (configured) return true;
  if (vapidError) return false;
  try {
    webPush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    configured = true;
    return true;
  } catch (err) {
    vapidError = (err as Error).message;
    console.error(
      `[push] VAPID keys rejected (${vapidError}). Set VAPID_SUBJECT to a mailto: ` +
        "or https:// address, and regenerate the key pair if it is malformed.",
    );
    return false;
  }
}

/** Why push is unavailable, for Settings to show instead of a dead toggle. */
export function pushUnavailableReason(): string | null {
  if (vapidError) return `VAPID keys are invalid: ${vapidError}`;
  if (!pushConfigured()) return "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set on the server.";
  return null;
}

/** What the service worker needs in order to show a notification sensibly. */
export interface PushPayload {
  title: string;
  body: string;
  /** In-app route to open when the notification is clicked. */
  url: string;
  /**
   * Groups related notifications in the OS tray and makes a later message able
   * to replace or close this one. An attendance prompt is tagged by record id,
   * which is what lets the resolve action take the notification back down.
   */
  tag?: string;
  /** A prompt that cannot be acted on is a nag; mark it so the OS stays quiet. */
  requireInteraction?: boolean;
  /** Carried through untouched so the client can branch without a payload change. */
  data?: Record<string, string>;
}

export type PushOutcome =
  /** The push service accepted the message. */
  | "sent"
  /** The browser is gone (404/410). The subscription is deleted, not retried. */
  | "gone"
  /** Delivered-by-the-service is unknown: a network error or a 5xx. */
  | "failed"
  /** This server cannot send push at all. */
  | "unconfigured";

export interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send one payload to one subscription.
 *
 * `endpoint`, `p256dh` and `auth` are exactly the trio a push service needs,
 * which is why they are stored rather than recomputed.
 */
export async function sendToSubscription(
  subscription: SubscriptionRow,
  payload: PushPayload,
): Promise<PushOutcome> {
  if (!ensureVapid()) return "unconfigured";
  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      // The default TTL is one month, which for a prompt that should not exist
      // tomorrow is far too long: a delivery service will happily hold a
      // notification and fire it hours later, when the class is long over.
      { TTL: 60 * 60, urgency: "high" },
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    // 401/403 mean our VAPID key no longer matches the subscription, which no
    // amount of retrying will fix; treat it like a dead endpoint so the row
    // does not linger and mislead the user in Settings.
    if (status === 401 || status === 403) return "gone";
    console.warn(
      `[push] Delivery failed (${status ?? "network"}): ${(err as Error).message}`,
    );
    return "failed";
  }
}

export interface FanoutResult {
  sent: number;
  failed: number;
  /** Endpoints the push service reported as dead; these rows were deleted. */
  removed: number;
  /** False when the server has no VAPID keys, so nothing was even attempted. */
  attempted: boolean;
}

/**
 * Fan a payload out to every browser a user has subscribed.
 *
 * Dead subscriptions are removed as a side effect. That is the only self-*
 * cleaning mechanism a push subscription has: the browser will never tell us
 * it is gone, so an endpoint that 404s has to be dropped or every future
 * notification pays for it forever.
 */
export async function pushToUser(
  userId: string,
  payload: PushPayload,
  /** Restrict to one subscription — used by the "test this device" path. */
  onlySubscriptionId?: string,
): Promise<FanoutResult> {
  if (!ensureVapid()) return { sent: 0, failed: 0, removed: 0, attempted: false };

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, ...(onlySubscriptionId ? { id: onlySubscriptionId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (subscriptions.length === 0) return { sent: 0, failed: 0, removed: 0, attempted: true };

  const now = new Date();
  let sent = 0;
  let failed = 0;
  const goneIds: string[] = [];

  for (const sub of subscriptions) {
    const outcome = await sendToSubscription(sub, payload);
    if (outcome === "sent") {
      sent++;
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastUsedAt: now, failureCount: 0, lastError: null },
      });
    } else if (outcome === "gone") {
      goneIds.push(sub.id);
    } else {
      failed++;
      // The counter is only ever reported, never acted on: a phone that is
      // merely offline should come back, and silently unsubscribing someone for
      // one failed delivery would be worse than the noise.
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { failureCount: { increment: 1 }, lastError: "Delivery failed" },
      });
    }
  }

  if (goneIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: goneIds } } });
  }

  return { sent, failed, removed: goneIds.length, attempted: true };
}
