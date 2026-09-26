import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { buildDayModel, findDisplacements, humanDuration } from '../services/dayModel.js';
import { dayKeyInTz, isValidTimezone } from '../lib/tz.js';
import { resolveUserTimezone } from '../middleware/timezone.js';

const router: RouterType = Router();
router.use(requireAuth);

const dayQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
});

export function resolveDate(raw: string | undefined, now: Date, tz: string): string {
  // No date asked for means "the day the user is currently living in", which is
  // a question only their timezone can answer.
  if (!raw) return dayKeyInTz(now, tz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    throw ApiError.badRequest('Invalid date');
  }
  return raw;
}

/**
 * The whole day in one response: merged timeline, honest capacity, progress.
 *
 * The Today screen makes exactly this call. Everything it renders is derived
 * here, so the client never has to reconcile five separate endpoints and guess
 * whether they agree about what time it is.
 */
router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const { date } = dayQuery.parse(req.query);
    const tz = await resolveUserTimezone(req);
    const model = await buildDayModel({
      userId: req.user.id,
      date: resolveDate(date, now, tz),
      now,
      tz,
    });
    res.json({ ok: true, data: model });
  } catch (err) {
    next(err);
  }
});

/**
 * What no longer fits, and where it could go.
 *
 * Advisory only. Nothing is moved on the server; the client renders the
 * consequence and the user decides. Called when a day is over capacity.
 */
router.get('/:date/displacement', async (req, res, next) => {
  try {
    const now = new Date();
    const tz = await resolveUserTimezone(req);
    const date = resolveDate(req.params.date, now, tz);
    const model = await buildDayModel({ userId: req.user.id, date, now, tz });
    if (model.capacity.verdict !== 'over' && model.capacity.verdict !== 'tight') {
      res.json({ ok: true, data: { date, displacements: [] } });
      return;
    }
    const displacements = await findDisplacements(req.user.id, date, now, 7, tz);
    res.json({ ok: true, data: { date, displacements } });
  } catch (err) {
    next(err);
  }
});

/**
 * Capacity settings: the awake window and the transition buffer.
 *
 * These three numbers decide every verdict the app gives, so they are exposed
 * directly rather than buried in a generic settings form.
 */
const capacityBody = z.object({
  dayStartMinutes: z.number().int().min(0).max(24 * 60).optional(),
  dayEndMinutes: z.number().int().min(0).max(24 * 60).optional(),
  bufferMinutes: z.number().int().min(0).max(60).optional(),
});

router.patch('/capacity', async (req, res, next) => {
  try {
    const body = capacityBody.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { dayStartMinutes: true, dayEndMinutes: true },
    });
    if (!user) throw ApiError.notFound('User not found');

    const start = body.dayStartMinutes ?? user.dayStartMinutes ?? 7 * 60;
    const end = body.dayEndMinutes ?? user.dayEndMinutes ?? 23 * 60;
    if (end - start < 60) {
      throw ApiError.badRequest('The day must be at least one hour long');
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        dayStartMinutes: body.dayStartMinutes,
        dayEndMinutes: body.dayEndMinutes,
        bufferMinutes: body.bufferMinutes,
      },
      select: { dayStartMinutes: true, dayEndMinutes: true, bufferMinutes: true },
    });

    res.json({
      ok: true,
      data: {
        ...updated,
        dayStartLabel: humanDuration(start),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
