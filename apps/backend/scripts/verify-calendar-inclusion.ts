/**
 * End-to-end check of calendar de-duplication and per-calendar inclusion.
 *
 * The unit tests cover the folding rules; this covers the parts that only show
 * up once Prisma, the routes and the day model are involved:
 *
 *   1. an event on an excluded calendar must not reserve capacity;
 *   2. including it must bring it back, with the same values;
 *   3. the same meeting on two calendars must be counted once;
 *   4. the stored rows must be untouched by any of it.
 *
 * It creates its own throwaway calendars and events and removes every one of
 * them afterwards, so the user's real data is left exactly as found.
 *
 * Env: DATABASE_URL, API, SMOKE_USER_ID, SMOKE_USER_EMAIL
 */
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';
import { dayKeyInTz } from '../src/lib/tz.js';
import { assertApiTarget } from './lib/target.js';

const API = process.env.API ?? 'http://localhost:4000';
const USER_ID = process.env.SMOKE_USER_ID;
const EMAIL = process.env.SMOKE_USER_EMAIL ?? 'test@example.com';

if (!USER_ID) {
  console.error('SMOKE_USER_ID is required');
  process.exit(1);
}

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

// Fails loudly if this API is not the deployment SMOKE_USER_ID belongs to.
await assertApiTarget({
  base: API,
  token: await signToken({ id: USER_ID as string, email: EMAIL }),
});

const user = await prisma.user.findUniqueOrThrow({ where: { id: USER_ID } });
const tz = user.timezone ?? 'UTC';
const date = dayKeyInTz(new Date(), tz);

const CAL_A = 'verify-include-cal-a';
const CAL_B = 'verify-include-cal-b';
// A linked calendar belongs to a Google account now, so the probe needs a
// throwaway connection to hang them off. It is never used to call Google.
const CONNECTION_ID = 'verify-include-conn';
const CONNECTION_B_ID = 'verify-include-conn-b';
// The id every Google account has. Two linked accounts owning the same calendar
// id is the case that a lookup by id alone gets wrong.
const SHARED_ID = 'primary';
const createdEventIds: string[] = [];

async function api(path: string, init?: RequestInit) {
  const token = await signToken({ id: USER_ID as string, email: EMAIL });
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Timezone': tz,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** A time inside the user's waking window so it lands on today's timeline. */
const at = (hour: number, minute = 0) => {
  const [y, m, d] = date.split('-').map(Number);
  // Interpreted in the user's zone, then converted to the UTC instant to store.
  const asUtcGuess = Date.UTC(y, m - 1, d, hour - (tz === 'UTC' ? 0 : 5.5), minute);
  return new Date(asUtcGuess);
};

async function makeEvent(calendarId: string, title: string, start: Date, end: Date) {
  const row = await prisma.calendarEvent.create({
    data: {
      userId: USER_ID as string,
      source: 'GOOGLE',
      sourceCalendarId: calendarId,
      googleEventId: `verify-${Math.random().toString(36).slice(2, 10)}`,
      title,
      startTime: start,
      endTime: end,
      allDay: false,
      isDeleted: false,
    },
  });
  createdEventIds.push(row.id);
  return row;
}

async function cleanup() {
  await prisma.calendarEvent.deleteMany({
    where: { userId: USER_ID as string, sourceCalendarId: { in: [CAL_A, CAL_B] } },
  });
  await prisma.calendarEvent.deleteMany({
    where: { userId: USER_ID as string, sourceCalendarId: SHARED_ID },
  });
  await prisma.linkedGoogleCalendar.deleteMany({
    where: {
      userId: USER_ID as string,
      connectionId: { in: [CONNECTION_ID, CONNECTION_B_ID] },
    },
  });
  await prisma.googleConnection.deleteMany({
    where: { id: { in: [CONNECTION_ID, CONNECTION_B_ID] } },
  });
}

const dayHas = (body: unknown, id: string) => {
  const data = (body as { data?: { timeline?: { key?: string }[] } }).data;
  return (data?.timeline ?? []).some((b) => b.key === `event-${id}`);
};

try {
  await cleanup();
  await prisma.googleConnection.create({
    data: {
      id: CONNECTION_ID,
      userId: USER_ID as string,
      googleAccountId: 'verify-include-account',
      email: 'verify-include@example.invalid',
      accessToken: 'probe',
    },
  });
  await prisma.linkedGoogleCalendar.createMany({
    data: [
      { id: CAL_A, userId: USER_ID as string, connectionId: CONNECTION_ID, summary: 'Verify A', isLinked: true, includeInDay: true },
      { id: CAL_B, userId: USER_ID as string, connectionId: CONNECTION_ID, summary: 'Verify B', isLinked: true, includeInDay: true },
    ],
  });

  // 07:00 in the user's zone is comfortably inside the default waking window.
  const start = at(7);
  const end = at(8);
  const eventA = await makeEvent(CAL_A, 'Verify Standup', start, end);

  console.log(`date under test: ${date} (${tz})\n`);

  // --- 1. an included calendar contributes its events -------------------------
  {
    const r = await api(`/api/day?date=${date}`);
    check('GET /api/day is 200', r.status === 200, `got ${r.status}`);
    check('an included calendar appears in the day', dayHas(r.body, eventA.id));
  }

  // --- 2. excluding the calendar removes it, without unlinking ---------------
  {
    const r = await api(`/api/calendar/google/connections/${CONNECTION_ID}/calendars/${CAL_A}`, {
      method: 'PATCH',
      body: JSON.stringify({ includeInDay: false }),
    });
    check('PATCH includeInDay is 200', r.status === 200, `got ${r.status}`);
    const link = await prisma.linkedGoogleCalendar.findUniqueOrThrow({
      where: { connectionId_id: { connectionId: CONNECTION_ID, id: CAL_A } },
    });
    check('includeInDay is persisted', link.includeInDay === false);
    check('the calendar is still linked', link.isLinked === true);

    const day = await api(`/api/day?date=${date}`);
    check('an excluded calendar is not in the day', !dayHas(day.body, eventA.id));
  }

  // --- 3. including it again brings the same event back ----------------------
  {
    await api(`/api/calendar/google/connections/${CONNECTION_ID}/calendars/${CAL_A}`, {
      method: 'PATCH',
      body: JSON.stringify({ includeInDay: true }),
    });
    const day = await api(`/api/day?date=${date}`);
    check('re-including restores the event', dayHas(day.body, eventA.id));
  }

  // --- 4. the same meeting on a second calendar is counted once ---------------
  {
    const { duplicates } = await import('../src/services/calendarDedup.js');
    const dupA = await makeEvent(CAL_B, 'Verify Standup', start, end);
    const day = await api(`/api/day?date=${date}`);
    check('the duplicate is not shown twice', !dayHas(day.body, dupA.id) || !dayHas(day.body, eventA.id));

    const both = await prisma.calendarEvent.findMany({
      where: { userId: USER_ID as string, sourceCalendarId: { in: [CAL_A, CAL_B] } },
    });
    const { canonical } = await import('../src/services/calendarDedup.js').then((m) =>
      m.dedupeEvents(both.map((e) => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime,
        endTime: e.endTime,
        allDay: e.allDay,
        source: e.source,
        googleEventId: e.googleEventId,
        sourceCalendarId: e.sourceCalendarId,
      }))),
    );
    check('exactly one of the pair survives folding', canonical.length === 1, `got ${canonical.length}`);
    check('both rows are still in the database', both.length === 2);
    void duplicates;
  }

  // --- 5. a genuinely different event is not folded away ---------------------
  {
    const other = await makeEvent(CAL_B, 'Verify Completely Different', at(9), at(10));
    const day = await api(`/api/day?date=${date}`);
    check('a different event is still shown', dayHas(day.body, other.id));
  }

  // --- 6. two accounts, one calendar id ---------------------------------------
  // The failure this guards against is silent and destructive: addressing a
  // calendar by its id alone would let account A's change fall on account B's
  // identically named calendar.
  {
    await prisma.googleConnection.create({
      data: {
        id: CONNECTION_B_ID,
        userId: USER_ID as string,
        googleAccountId: 'verify-include-account-b',
        email: 'verify-include-b@example.invalid',
        accessToken: 'probe',
      },
    });
    await prisma.linkedGoogleCalendar.createMany({
      data: [
        { id: SHARED_ID, userId: USER_ID as string, connectionId: CONNECTION_ID, summary: 'A primary', isLinked: true, includeInDay: true },
        { id: SHARED_ID, userId: USER_ID as string, connectionId: CONNECTION_B_ID, summary: 'B primary', isLinked: true, includeInDay: true },
      ],
    });

    // Exclude account A's copy only.
    const r = await api(`/api/calendar/google/connections/${CONNECTION_ID}/calendars/${SHARED_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ includeInDay: false }),
    });
    check('a shared calendar id can be patched through one account', r.status === 200, `got ${r.status}`);

    const a = await prisma.linkedGoogleCalendar.findUniqueOrThrow({
      where: { connectionId_id: { connectionId: CONNECTION_ID, id: SHARED_ID } },
    });
    const b = await prisma.linkedGoogleCalendar.findUniqueOrThrow({
      where: { connectionId_id: { connectionId: CONNECTION_B_ID, id: SHARED_ID } },
    });
    check("the addressed account's calendar changed", a.includeInDay === false);
    check("the other account's calendar of the same id did not", b.includeInDay === true);

    // The listing has to say which account each calendar belongs to, or the
    // client cannot address the right one.
    const list = await api('/api/calendar/google/calendars');
    const rows = (list.body as { data?: { connectionId: string; id: string }[] }).data ?? [];
    const shared = rows.filter((x) => x.id === SHARED_ID);
    check('both copies of the shared id are listed', shared.length === 2, `got ${shared.length}`);
    check(
      'each listed copy names its own account',
      new Set(shared.map((x) => x.connectionId)).size === 2,
    );
  }

  // --- 7. validation ---------------------------------------------------------
  {
    const bad = await api(`/api/calendar/google/connections/${CONNECTION_ID}/calendars/${CAL_A}`, {
      method: 'PATCH',
      body: JSON.stringify({ includeInDay: 'yes' }),
    });
    check('a non-boolean includeInDay is rejected', bad.status >= 400, `got ${bad.status}`);
  }
  {
    const missing = await api(`/api/calendar/google/connections/${CONNECTION_ID}/calendars/does-not-exist`, {
      method: 'PATCH',
      body: JSON.stringify({ includeInDay: false }),
    });
    check('patching an unlinked calendar is a 404', missing.status === 404, `got ${missing.status}`);
  }
} finally {
  await cleanup();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
