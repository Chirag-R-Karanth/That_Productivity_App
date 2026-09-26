import { Router } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { User, UpdateUserRequest } from "@prodapp/shared-types";
import { prisma } from "../lib/prisma.js";
import { signToken, verifyToken } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../lib/errors.js";
import { env } from "../lib/env.js";
import {
  buildAuthUrl,
  decodeState,
  encodeState,
  exchangeCode,
  fetchGoogleIdentity,
  googleConfigured,
} from "../services/google.js";
import { syncConnectionCalendars } from "../services/googleConnections.js";

const router: RouterType = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  attendanceAutoMarkHours: z.number().int().min(0).nullable().optional(),
  pomodoroWorkMinutes: z.number().int().min(1).max(120).optional(),
  pomodoroBreakMinutes: z.number().int().min(1).max(60).optional(),
  pomodoroLongBreakMinutes: z.number().int().min(5).max(120).optional(),
  pomodoroSessionsPerCycle: z.number().int().min(2).max(12).optional(),
  chimeOnTheHour: z.boolean().optional(),
  fcmToken: z.string().nullable().optional(),
  onboardingComplete: z.boolean().optional(),
});

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) throw ApiError.conflict("An account with this email already exists");

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash,
        name: body.name ?? "",
      },
    });

    const token = await signToken({ id: user.id, email: user.email });
    res.status(201).json({ ok: true, data: { token, user: toPublicUser(user) } });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user?.passwordHash) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) throw ApiError.unauthorized("Invalid email or password");

    const token = await signToken({ id: user.id, email: user.email });
    res.json({ ok: true, data: { token, user: toPublicUser(user) } });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    res.json({
      ok: true,
      data: {
        ...toPublicUser(user),
        attendanceAutoMarkHours: user.attendanceAutoMarkHours,
        pomodoroWorkMinutes: user.pomodoroWorkMinutes,
        pomodoroBreakMinutes: user.pomodoroBreakMinutes,
        pomodoroLongBreakMinutes: user.pomodoroLongBreakMinutes,
        pomodoroSessionsPerCycle: user.pomodoroSessionsPerCycle,
        chimeOnTheHour: user.chimeOnTheHour,
        onboardingComplete: user.onboardingComplete,
        googleCalendarLinked: user.googleRefreshToken != null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const body: UpdateUserRequest = updateUserSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: body.name,
        attendanceAutoMarkHours: body.attendanceAutoMarkHours,
        pomodoroWorkMinutes: body.pomodoroWorkMinutes,
        pomodoroBreakMinutes: body.pomodoroBreakMinutes,
        pomodoroLongBreakMinutes: body.pomodoroLongBreakMinutes,
        pomodoroSessionsPerCycle: body.pomodoroSessionsPerCycle,
        chimeOnTheHour: body.chimeOnTheHour,
        fcmToken: body.fcmToken,
        onboardingComplete: body.onboardingComplete,
      },
    });

    res.json({ ok: true, data: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---------- Google Calendar OAuth ----------
//
// Browser hits GET /api/auth/google with the login token in the query string
// (a redirect can't carry an Authorization header). The token travels inside
// `state`, so the callback can identify the user and still always exchanges
// the code server-side using our client secret (no token leakage outward).

router.get("/google/status", (_req, res) => {
  res.json({ ok: true, data: { configured: googleConfigured() } });
});

router.get("/google", async (req, res, next) => {
  try {
    if (!googleConfigured()) {
      throw ApiError.conflict("Google Calendar is not configured on the server yet");
    }
    // Redirects can't carry an Authorization header, so the SPA passes the
    // login token as a query param instead; validate it manually here.
    const token =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice("Bearer ".length)
        : (req.query.token as string);
    if (!token) throw ApiError.unauthorized("Missing authentication token");
    await verifyToken(token);

    const state = encodeState({ token });
    res.redirect(buildAuthUrl(state));
  } catch (err) {
    next(err);
  }
});

router.get("/google/callback", async (req, res) => {
  const fail = (reason: string) => {
    const q = new URLSearchParams({ google: "error", reason });
    res.redirect(`${env.webAppUrl}/settings?${q.toString()}`);
  };

  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string } | Record<string, string>;
    if (error) return fail(String(error));
    if (!code || !state) return fail("missing_code");

    const payload = decodeState<{ token?: string }>(state);
    if (!payload.token) return fail("invalid_state");

    const verified = await verifyToken(payload.token);

    const stored = await exchangeCode(code);
    // Google's own account id is what a re-link matches on. The email can
    // change on the account, so keying connections by email would orphan the
    // calendars and task lists of a renamed account.
    const identity = await fetchGoogleIdentity(stored.accessToken);

    // One row per Google account, not per user: linking a second account adds a
    // row instead of replacing the first one's tokens. Re-linking an account
    // that is already connected refreshes that row in place.
    const connection = await prisma.googleConnection.upsert({
      where: {
        userId_googleAccountId: {
          userId: verified.sub,
          googleAccountId: identity.sub,
        },
      },
      create: {
        userId: verified.sub,
        googleAccountId: identity.sub,
        email: identity.email,
        displayName: identity.name,
        accessToken: stored.accessToken,
        refreshToken: stored.refreshToken,
        tokenExpiresAt: stored.expiresAt,
        scopes: stored.scopes,
        // A reconnect is the cure for a dead grant, so clear the flag here.
        needsRelink: false,
        lastError: null,
      },
      update: {
        email: identity.email,
        displayName: identity.name,
        accessToken: stored.accessToken,
        // Google only sends a refresh token the first time. Overwriting with
        // null here would throw away the token that keeps this account syncing.
        ...(stored.refreshToken ? { refreshToken: stored.refreshToken } : {}),
        tokenExpiresAt: stored.expiresAt,
        scopes: stored.scopes,
        needsRelink: false,
        lastError: null,
      },
    });

    // Materialize this account's calendar list. Best effort: the tokens are
    // stored either way and the next sync can retry the list.
    const synced = await syncConnectionCalendars(connection);
    if (synced.error) {
      await prisma.googleConnection.update({
        where: { id: connection.id },
        data: { lastError: synced.error },
      });
    } else {
      await prisma.googleConnection.update({
        where: { id: connection.id },
        data: { lastSyncedAt: new Date(), lastError: null },
      });
    }

    res.redirect(
      `${env.webAppUrl}/settings?${new URLSearchParams({ google: "linked", account: identity.email }).toString()}`,
    );
  } catch (err) {
    fail(err instanceof Error ? err.message.slice(0, 200) : "unknown_error");
  }
});

/**
 * The accounts linked to the signed-in user.
 *
 * Returns one entry per Google account so the settings screen can list them and
 * offer a reconnect for any that needs one. Tokens are never included.
 */
router.get("/google/connections", requireAuth, async (req, res, next) => {
  try {
    const connections = await prisma.googleConnection.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        needsRelink: true,
        lastSyncedAt: true,
        lastError: true,
        tokenExpiresAt: true,
        createdAt: true,
        _count: { select: { calendars: true } },
      },
    });
    res.json({
      ok: true,
      data: connections.map((c) => ({
        id: c.id,
        email: c.email,
        displayName: c.displayName,
        needsRelink: c.needsRelink,
        lastSyncedAt: c.lastSyncedAt,
        lastError: c.needsRelink ? c.lastError : null,
        calendarCount: c._count.calendars,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Unlink one Google account.
 *
 * The events and tasks it produced cascade away with it, which is the honest
 * outcome: they came from that account and cannot be maintained without it.
 * Other linked accounts are untouched.
 */
router.delete("/google/connections/:id", requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    // Scoped by userId so an id from another account cannot be unlinked.
    const removed = await prisma.googleConnection.deleteMany({
      where: { id, userId: req.user.id },
    });
    if (removed.count === 0) throw ApiError.notFound("No such linked Google account");
    res.json({ ok: true, data: { disconnected: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
