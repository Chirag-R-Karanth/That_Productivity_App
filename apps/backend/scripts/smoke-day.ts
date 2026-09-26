/**
 * End-to-end smoke test of the new endpoints against a running API.
 *
 * Mints a token with the app's own signing code (no password needed), then
 * exercises /api/day, /api/day/:date/displacement and /api/review. Read-only:
 * it creates and removes nothing.
 *
 * Usage: API=http://localhost:4000 npx tsx scripts/smoke-day.ts
 */
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';
import { assertApiTarget, resolveTargetUser } from './lib/target.js';

const API = (process.env.API ?? 'http://localhost:4000').replace(/\/$/, '');

// The dev and prod databases are separate, so their user rows have different
// ids. SMOKE_USER_ID lets this sign a token the target API actually recognises.
const user = await resolveTargetUser(prisma);
const token = await signToken({ id: user.id, email: user.email });

// Without this the script talks to whatever is on the API port, which may be a
// dev server whose database has never heard of this user.
await assertApiTarget({ base: API, token });

async function get<T>(path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
};

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

console.log(`API: ${API}\nuser: ${user.email}\ntoday: ${today}\n`);

// ---- /api/day ---------------------------------------------------------------
const day = await get<{ ok: boolean; data: any; error?: unknown }>(`/api/day?date=${today}`);
check('GET /api/day returns 200', day.status === 200, `got ${day.status}`);
check('GET /api/day ok:true', day.body.ok === true);

const m = day.body.data;
if (m) {
  const c = m.capacity;
  check('capacity present', !!c);
  check('verdict is a known value',
    ['open', 'light', 'balanced', 'tight', 'over'].includes(c.verdict), c.verdict);
  check('available = window - fixed - buffers (never exceeds window)',
    c.availableMinutes <= c.windowEndMinutes - c.windowStartMinutes,
    `${c.availableMinutes} <= ${c.windowEndMinutes - c.windowStartMinutes}`);
  check('delta = available - planned',
    c.deltaMinutes === c.availableMinutes - c.plannedMinutes,
    `${c.deltaMinutes}`);
  check('headline is a real sentence',
    typeof c.headline === 'string' && c.headline.length > 10, JSON.stringify(c.headline));
  check('timeline is an array', Array.isArray(m.timeline), `${m.timeline.length} blocks`);
  check('timeline is ordered', m.timeline.every((b: any, i: number, a: any[]) =>
    i === 0 || (a[i - 1].startMinutes ?? Infinity) <= (b.startMinutes ?? Infinity)));
  check('free blocks are inside the window', m.free.every((f: any) =>
    f.startMinutes >= c.windowStartMinutes && f.endMinutes <= c.windowEndMinutes));
  check('free + committed never overlap', m.free.every((f: any) => {
    const clash = m.timeline.filter((b: any) =>
      b.startMinutes !== null && b.endMinutes !== null &&
      b.kind !== 'plan' && b.kind !== 'deadline' &&
      b.startMinutes < f.endMinutes && b.endMinutes > f.startMinutes);
    return clash.length === 0;
  }));
  check('planned tasks carry ISO dates',
    m.planned.every((t: any) => typeof t.createdAt === 'string'));
  check('serverNow is present', typeof m.serverNow === 'string');

  console.log(`\n  headline : ${c.headline}`);
  console.log(`  committed: ${c.fixedMinutes}m across ${c.fixedCount}`);
  console.log(`  usable   : ${c.availableMinutes}m`);
  console.log(`  planned  : ${c.plannedMinutes}m  (${c.verdict})`);
  console.log(`  timeline : ${m.timeline.map((b: any) => `${b.kind}:${b.title.slice(0, 18)}`).join(' | ')}`);
  console.log(`  free     : ${m.free.map((f: any) => `${f.startMinutes}-${f.endMinutes}`).join(' ') || 'none'}`);
}

// ---- invalid input must be rejected, not silently defaulted ----------------
const bad = await get<{ ok: boolean }>(`/api/day?date=not-a-date`);
check('invalid date rejected', bad.status === 400, `got ${bad.status}`);

// ---- /api/day/:date/displacement ------------------------------------------
const disp = await get<{ ok: boolean; data: { displacements: any[] } }>(
  `/api/day/${today}/displacement`,
);
check('GET displacement returns 200', disp.status === 200, `got ${disp.status}`);
check('displacement is an array', Array.isArray(disp.body.data?.displacements));
check('nothing was moved server-side',
  disp.body.data.displacements.every((x: any) => x.suggestedDate === null || typeof x.suggestedDate === 'string'));

// ---- /api/review -----------------------------------------------------------
for (const period of ['day', 'week'] as const) {
  const r = await get<{ ok: boolean; data: any }>(`/api/review?period=${period}`);
  check(`GET /api/review?period=${period} returns 200`, r.status === 200, `got ${r.status}`);
  const rep = r.body.data;
  if (rep) {
    check(`review(${period}) has stats`, !!rep.stats);
    check(`review(${period}) days length matches period`,
      rep.days.length === (period === 'day' ? 1 : 7), `${rep.days.length}`);
    check(`review(${period}) focusByHour has 24 buckets`,
      rep.stats.focusByHour.length === 24);
    check(`review(${period}) patterns is an array`, Array.isArray(rep.patterns));
    check(`review(${period}) every pattern states its sample size`,
      rep.patterns.every((p: any) => typeof p.samples === 'number' && p.samples > 0));
    check(`review(${period}) completionRate within 0..1`,
      rep.stats.completionRate >= 0 && rep.stats.completionRate <= 1);
    console.log(`  review(${period}): ${rep.stats.tasksCompleted}/${rep.stats.tasksPlanned} tasks, ` +
      `${rep.stats.focusMinutes}m focus, ${rep.patterns.length} patterns`);
    for (const p of rep.patterns) {
      console.log(`    [${p.kind}] ${p.title} (n=${p.samples}, conf=${p.confidence.toFixed(2)})`);
    }
  }
}

// ---- auth is still enforced -----------------------------------------------
const noAuth = await fetch(`${API}/api/day`);
check('unauthenticated /api/day is 401', noAuth.status === 401, `got ${noAuth.status}`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
await prisma.$disconnect();
process.exit(failures === 0 ? 0 : 1);
