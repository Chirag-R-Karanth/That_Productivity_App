import { Router } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../lib/errors.js";
import { pushToUser, pushUnavailableReason, vapidPublicKey } from "../services/webpush.js";

const router: RouterType = Router();
router.use(requireAuth);

/**
 * What the browser needs before it can subscribe.
 *
 * `configured` is reported separately from the key itself because the two
 * failure modes are different: a server with no VAPID keys needs an
 * administrator, while a browser without the Push API needs nothing — it is
 * simply never going to work, and saying so is kinder than a toggle that
 * silently does nothing.
 */
router.get("/push/status", (_req, res) => {
  res.json({
    ok: true,
    data: {
      configured: vapidPublicKey() !== null,
      publicKey: vapidPublicKey(),
      reason: pushUnavailableReason(),
    },
  });
});

/**
 * A subscription as the browser gave it to us.
 *
 * Only the three fields a push service actually needs are required. A browser
 * can add more, and older ones omit some; rejecting the extras would break
 * subscription on a browser that works fine.
 */
const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

/**
 * Register this browser for push.
 *
 * Upserted on the endpoint, because the endpoint *is* the browser's identity: a
 * page reload, a re-render, or a user toggling notifications off and on again
 * all produce the same endpoint, and each of those must update the one row
 * rather than leave a trail of duplicates that each keep costing a failed
 * delivery.
 */
router.post("/push/subscriptions", async (req, res, next) => {
  try {
    const body = subscribeSchema.parse(req.body);

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId: req.user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: req.get("user-agent")?.slice(0, 400) ?? null,
        failureCount: 0,
        lastError: null,
      },
      update: {
        // Whoever is signed in on this browser owns it. Without this, signing
        // in as somebody else on a shared device would leave the subscription
        // attached to the previous account: the new account's Settings would
        // show no browsers and the new account would silently get nothing.
        userId: req.user.id,
        // Keys rotate when a browser re-subscribes; carrying the old ones
        // forward would produce a subscription the push service rejects.
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: req.get("user-agent")?.slice(0, 400) ?? null,
        failureCount: 0,
        lastError: null,
      },
    });

    res.status(201).json({
      ok: true,
      data: {
        id: subscription.id,
        createdAt: subscription.createdAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Every browser currently registered to this account, newest first. */
router.get("/push/subscriptions", async (req, res, next) => {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        failureCount: true,
        lastError: true,
      },
    });
    res.json({
      ok: true,
      data: subscriptions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
        failing: s.failureCount > 0,
        lastError: s.lastError,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const unsubscribeSchema = z.object({
  /** Omit to remove every device for this account. */
  id: z.string().min(1).optional(),
  /** Also accept the endpoint, which is what the browser actually holds. */
  endpoint: z.string().url().max(2048).optional(),
});

/**
 * Stop sending push to one browser, or to all of them.
 *
 * The row is deleted rather than flagged off: a push service holds no
 * unsubscribe endpoint of its own, so the only way to actually stop is to stop
 * offering it the address.
 */
router.delete("/push/subscriptions", async (req, res, next) => {
  try {
    const body = unsubscribeSchema.parse(req.body ?? {});

    if (body.id) {
      // Scoped by userId as well as id, so one account cannot delete another's
      // subscription by guessing a row id.
      const deleted = await prisma.pushSubscription.deleteMany({
        where: { id: body.id, userId: req.user.id },
      });
      if (deleted.count === 0) throw ApiError.notFound("No such subscription on this account");
    } else if (body.endpoint) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: body.endpoint, userId: req.user.id },
      });
    } else {
      await prisma.pushSubscription.deleteMany({ where: { userId: req.user.id } });
    }

    res.json({ ok: true, data: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Send a test notification to one of this account's browsers.
 *
 * The only way to find out whether push works on this browser, this network and
 * this server is to try it — permission being granted says nothing about
 * whether the message arrives.
 */
router.post("/push/test", async (req, res, next) => {
  try {
    const body = z.object({ id: z.string().min(1).optional() }).parse(req.body ?? {});

    const result = await pushToUser(
      req.user.id,
      {
        title: "That Productivity App",
        body: "Notifications are working. This is what a class reminder looks like.",
        url: "/settings?tab=notifications",
        tag: "prodapp-test",
        data: { type: "test" },
      },
      body.id,
    );

    if (!result.attempted) {
      throw ApiError.badRequest(
        pushUnavailableReason() ?? "Push is not configured on this server.",
      );
    }
    res.json({
      ok: true,
      data: { sent: result.sent, failed: result.failed, removed: result.removed },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
