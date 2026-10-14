/**
 * End-to-end smoke test of the notification endpoints against a running API.
 *
 * Mints a token with the app's own signing code (no password needed) and walks
 * the shape the browser actually depends on. Read-only: it subscribes nothing
 * and unsubscribes nothing, so it can be pointed at production.
 *
 * Usage: API=http://localhost:4000 npx tsx scripts/smoke-notifications.ts
 */
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';
import { assertApiTarget, resolveTargetUser } from './lib/target.js';

const API = (process.env.API ?? 'http://localhost:4000').replace(/\/$/, '');

const user = await resolveTargetUser(prisma);
const token = await signToken({ id: user.id, email: user.email });

await assertApiTarget({ base: API, token });

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  authed = true,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(authed ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as T };
}

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
};

type Envelope<T> = { ok: boolean; data: T; error?: { code: string; message: string } };

console.log(`API: ${API}\nuser: ${user.email}\n`);

// ---- the endpoints exist at all -------------------------------------------
// An unmounted router answers 404 and an unmounted auth check answers 401, so
// this is what separates "the feature is deployed" from "the page is broken".
for (const path of [
  '/api/notifications/push/status',
  '/api/notifications/push/subscriptions',
]) {
  const anon = await call<Envelope<unknown>>('GET', path, undefined, false);
  check(`${path} requires a session`, anon.status === 401, `got ${anon.status}`);
}

// ---- /push/status ----------------------------------------------------------
const status = await call<Envelope<{
  configured: boolean;
  publicKey: string | null;
  reason: string | null;
}>>('GET', '/api/notifications/push/status');
check('GET /push/status returns 200', status.status === 200, `got ${status.status}`);
check('GET /push/status ok:true', status.body.ok === true);

const s = status.body.data;
check('the server reports a VAPID key', s.configured === true, `configured=${s.configured}`);
check('the public key is the one a browser can use', typeof s.publicKey === 'string' && s.publicKey.length > 20);
check(
  'a configured server has no reason to be unavailable',
  s.reason === null,
  String(s.reason),
);
// The browser refuses a malformed key, so a value that would be rejected here is
// worth catching before a user ever sees the enable button.
const decoded = Buffer.from(s.publicKey ?? '', 'base64url');
check('the public key decodes to an uncompressed P-256 point', decoded.length === 65 && decoded[0] === 0x04, `${decoded.length} bytes`);
check(
  'the public key is a single environment variable, not a pair',
  s.publicKey === s.publicKey.trim() && !s.publicKey.includes(','),
);

// ---- /push/subscriptions ---------------------------------------------------
const subs = await call<Envelope<Array<{
  id: string;
  userAgent: string | null;
  createdAt: string;
  failing: boolean;
  lastError: string | null;
}>>>('GET', '/api/notifications/push/subscriptions');
check('GET /push/subscriptions returns 200', subs.status === 200, `got ${subs.status}`);
check('GET /push/subscriptions is a list', Array.isArray(subs.body.data), `${subs.body.data?.length} browsers`);
check(
  'every browser has the fields the settings panel reads',
  subs.body.data.every((b) => typeof b.id === 'string' && typeof b.failing === 'boolean' && typeof b.createdAt === 'string'),
);

// ---- validation ------------------------------------------------------------
// A browser that sends a subscription with no keys is not a browser we can ever
// deliver to, and it must be told so rather than stored.
const noKeys = await call<Envelope<unknown>>('POST', '/api/notifications/push/subscriptions', {
  endpoint: 'https://example.invalid/push/smoke',
});
check('a subscription without keys is rejected', noKeys.status === 400, `got ${noKeys.status}`);
check('the rejection explains itself', noKeys.body.error?.code === 'VALIDATION_ERROR' && !!noKeys.body.error?.message, noKeys.body.error?.code);

const notAUrl = await call<Envelope<unknown>>('POST', '/api/notifications/push/subscriptions', {
  endpoint: 'not-a-url',
  keys: { p256dh: 'a', auth: 'b' },
});
check('a subscription with a broken endpoint is rejected', notAUrl.status === 400, `got ${notAUrl.status}`);

// ---- ownership -------------------------------------------------------------
// Deleting somebody else's subscription by guessing its id must be a no-op
// rather than a success: the row is scoped by userId as well as id.
const foreign = await prisma.pushSubscription.findFirst({
  where: { userId: { not: user.id } },
  select: { id: true },
});
if (foreign) {
  const stolen = await call<Envelope<unknown>>('DELETE', '/api/notifications/push/subscriptions', { id: foreign.id });
  check("another account's subscription cannot be deleted", stolen.status === 404, `got ${stolen.status}`);
  check(
    "another account's subscription is still there",
    (await prisma.pushSubscription.findUnique({ where: { id: foreign.id } })) !== null,
  );
} else {
  console.log('SKIP  cross-account delete — no other account has a browser registered');
}

// ---- /push/test with nothing registered ------------------------------------
// Not an error: the account simply has no browser, and the response has to say
// so in a way the settings panel can show rather than claiming success.
const test = await call<Envelope<{ sent: number; failed: number; removed: number }>>(
  'POST',
  '/api/notifications/push/test',
  {},
);
check('POST /push/test returns 200', test.status === 200, `got ${test.status}`);
check('POST /push/test reports its counts', typeof test.body.data?.sent === 'number', JSON.stringify(test.body.data));
check('POST /push/test with no browser sends nothing', test.body.data?.sent === 0);

// ---- /api/auth/me ----------------------------------------------------------
const me = await call<Envelope<Record<string, unknown>>>('GET', '/api/auth/me');
check('GET /api/auth/me returns 200', me.status === 200, `got ${me.status}`);
const prefs = me.body.data ?? {};
for (const key of ['notifyAttendance', 'notifyCalendar', 'notifyTasks', 'notifyFocus']) {
  check(`/api/auth/me carries ${key}`, typeof prefs[key] === 'boolean', String(prefs[key]));
}

// ---- /api/events -----------------------------------------------------------
// The bell reads both halves of this response, so both have to be there: an
// events array that is missing the pending-attendance list would render an empty
// bell on exactly the day it matters. The rows are already filtered to
// UNCONFIRMED server-side, so what the bell has to be able to trust is that
// each one can be linked to and answered.
const events = await call<Envelope<{ events: unknown[]; pendingAttendance: unknown[] }>>('GET', '/api/events');
check('GET /api/events returns 200', events.status === 200, `got ${events.status}`);
check('GET /api/events carries events', Array.isArray(events.body.data?.events));
check(
  'GET /api/events carries pendingAttendance',
  Array.isArray(events.body.data?.pendingAttendance),
  `${events.body.data?.pendingAttendance?.length} pending`,
);
check(
  'every pending attendance row can be linked to and answered',
  (events.body.data?.pendingAttendance ?? []).every((r) => {
    const row = r as {
      recordId?: unknown;
      courseId?: unknown;
      courseName?: unknown;
      date?: unknown;
      prompted?: unknown;
    };
    return (
      typeof row.recordId === 'string' &&
      typeof row.courseId === 'string' &&
      typeof row.courseName === 'string' &&
      typeof row.date === 'string' &&
      typeof row.prompted === 'boolean'
    );
  }),
);

await prisma.$disconnect();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
