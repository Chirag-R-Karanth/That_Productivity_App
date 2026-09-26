import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { buildReview } from '../services/review.js';
import { resolveDate } from './day.js';
import { resolveUserTimezone } from '../middleware/timezone.js';

const router: RouterType = Router();
router.use(requireAuth);

const periodQuery = z.object({
  period: z.enum(['day', 'week']).default('week'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * Review: planned vs actual, the rhythm of the day, and the patterns the data
 * actually supports.
 *
 * Deliberately not "8/10 tasks done". The report compares intent against
 * reality and reports only claims that clear a sample-size floor.
 */
router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const { period, date } = periodQuery.parse(req.query);
    const tz = await resolveUserTimezone(req);
    const report = await buildReview({
      userId: req.user.id,
      period,
      date: resolveDate(date, now, tz),
      now,
      tz,
    });
    res.json({ ok: true, data: report });
  } catch (err) {
    next(err);
  }
});

export default router;
