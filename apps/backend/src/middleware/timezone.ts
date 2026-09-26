/**
 * Which timezone a request should be answered in.
 *
 * Priority:
 *   1. the zone the client reports on this request — the browser knows where the
 *      person actually is right now, which is the only thing that can answer
 *      "what day is it" correctly for someone who has travelled or switched
 *      devices. It is written back so it stays durable;
 *   2. the zone stored on the user record — the fallback for anything running
 *      without a browser (background jobs, calendar sync, a plain curl);
 *   3. UTC, so behaviour stays defined rather than depending on the host.
 *
 * The reported zone is only trusted if it is a real IANA identifier. An
 * unrecognised string is ignored rather than allowed to reach `Intl`, and a
 * zone worth remembering is persisted for next time.
 */

import type { Request } from 'express';
import { prisma } from '../lib/prisma.js';
import { isValidTimezone } from '../lib/tz.js';

const TZ_HEADER = 'x-timezone';
const FALLBACK = 'UTC';

/** Read a client-reported zone off the request, if it names a real zone. */
export function reportedTimezone(req: Request): string | null {
  const raw = req.header(TZ_HEADER);
  if (!raw) return null;
  const tz = raw.trim();
  return isValidTimezone(tz) ? tz : null;
}

export async function resolveUserTimezone(req: Request): Promise<string> {
  const reported = reportedTimezone(req);
  if (reported) {
    const stored = (req.user as { timezone?: string | null }).timezone ?? null;
    if (reported !== stored) {
      // Fire-and-forget: a slow write must not hold up the response.
      void prisma.user
        .update({ where: { id: req.user.id }, data: { timezone: reported } })
        .catch(() => {});
    }
    return reported;
  }

  const stored = (req.user as { timezone?: string | null }).timezone ?? null;
  return isValidTimezone(stored) ? stored : FALLBACK;
}
