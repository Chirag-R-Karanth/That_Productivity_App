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
  googleConfigured,
  listCalendars,
} from "../services/google.js";

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
        chimeOnTheHour: user.chimeOnTheHour,
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

    const user = await prisma.user.update({
      where: { id: verified.sub },
      data: {
        googleAccessToken: stored.accessToken,
        googleRefreshToken: stored.refreshToken,
        googleTokenExpiresAt: new Date(stored.expiresAt),
      },
    });

    // Materialize the user's calendar list into LinkedGoogleCalendar.
    try {
      const list = await listCalendars(user.googleAccessToken!);
      await prisma.$transaction(
        (list.items ?? []).map((item) =>
          prisma.linkedGoogleCalendar.upsert({
            where: { id: item.id },
            create: {
              id: item.id,
              userId: user.id,
              summary: item.summary,
              backgroundColor: item.backgroundColor ?? null,
              accessRole: item.accessRole ?? null,
            },
            update: { isLinked: true, summary: item.summary },
          }),
        ),
      );
    } catch {
      // Token still stored; first sync can retry the calendar list.
    }

    res.redirect(`${env.webAppUrl}/settings?google=linked`);
  } catch {
    fail("oauth_failed");
  }
});

export default router;