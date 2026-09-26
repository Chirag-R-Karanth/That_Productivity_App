/**
 * Check the capacity engine against the real timetable.
 *
 * Prints the coming week the way a person would read it, and asserts the
 * arithmetic underneath. The invariants are the ones that would quietly rot:
 * free time and commitments must never overlap, usable time can never exceed the
 * awake window, and the verdict has to agree with the arithmetic that produced it.
 *
 * Run with: DATABASE_URL=... npx tsx scripts/verify-capacity.ts
 */
import { prisma } from '../src/lib/prisma.js';
import { buildDayModel, findDisplacements, humanDuration } from '../src/services/dayModel.js';
import { addDaysTz, dayKeyInTz } from '../src/lib/tz.js';

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

const user = await prisma.user.findFirst();
if (!user) {
  console.log('no user found');
  process.exit(1);
}

console.log(`user: ${user.email}  tz: ${user.timezone ?? '(unset — defaulting to UTC)'}\n`);

const now = new Date();
// Resolved in the user's own zone, exactly as the app does it. Computing this
// from the host clock is the bug this script exists alongside.
const tz = user.timezone ?? 'UTC';
const today = dayKeyInTz(now, tz);
console.log(`server says ${now.toISOString()} → today is ${today} for ${tz}\n`);

for (let i = 0; i < 7; i++) {
  const key = addDaysTz(today, i, tz);
  const m = await buildDayModel({ userId: user.id, date: key, now, tz });
  const c = m.capacity;
  const dow = new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });

  console.log(
    `${key} ${dow}  fixed=${humanDuration(c.fixedMinutes)}/${c.fixedCount}  ` +
      `avail=${humanDuration(c.availableMinutes)}  planned=${humanDuration(c.plannedMinutes)}  ` +
      `delta=${c.deltaMinutes >= 0 ? '+' : ''}${c.deltaMinutes}  ${c.verdict}`,
  );
  console.log(
    `   timeline: ${m.timeline.map((b) => `${b.kind}:${b.title.slice(0, 26)}@${b.startMinutes ?? '-'}`).join(' | ') || '(empty)'}`,
  );
  console.log(`   free: ${m.free.map((f) => `${f.startMinutes}-${f.endMinutes}(${f.durationMinutes}m)`).join(' ') || '(none)'}`);
  console.log(`   headline: ${c.headline}\n`);

  const windowMinutes = m.capacity.windowEndMinutes - m.capacity.windowStartMinutes;

  check(`${key}: usable time never exceeds the awake window`, c.availableMinutes <= windowMinutes,
    `${c.availableMinutes} <= ${windowMinutes}`);
  check(`${key}: delta is available minus planned`, c.deltaMinutes === c.availableMinutes - c.plannedMinutes,
    `${c.deltaMinutes}`);
  check(`${key}: timeline is ordered and non-overlapping`, isOrdered(m.timeline), '');
  check(`${key}: free blocks never overlap commitments`, noOverlap(m.free, m.timeline),
    `${m.free.length} free / ${m.timeline.length} blocks`);
  check(`${key}: verdict matches the arithmetic`, verdictAgrees(c.verdict, c.deltaMinutes),
    `verdict=${c.verdict} delta=${c.deltaMinutes}`);
}

console.log('--- displacement (today) ---');
const disp = await findDisplacements(user.id, today, now, 7, tz);
if (disp.length === 0) console.log('nothing displaced (day fits, or no estimates)\n');
for (const d of disp) {
  console.log(`  [${d.risk}] ${d.task.title} (${d.estimateMinutes}m) -> ${d.suggestedDate ?? 'nowhere'}: ${d.reason}`);
}
check('displacement is advisory: every entry carries a reason', disp.every((d) => d.reason.length > 0), `${disp.length} suggestion(s)`);

/** Blocks must start before they end, and each must begin after the previous ends. */
function isOrdered(blocks: { startMinutes: number | null; endMinutes: number | null }[]): boolean {
  let prevEnd = -Infinity;
  for (const b of blocks) {
    if (b.startMinutes === null || b.endMinutes === null) continue;
    if (b.endMinutes <= b.startMinutes) return false;
    if (b.startMinutes < prevEnd) return false;
    prevEnd = b.endMinutes;
  }
  return true;
}

function noOverlap(
  free: { startMinutes: number; endMinutes: number }[],
  blocks: { kind: string; startMinutes: number | null; endMinutes: number | null }[],
): boolean {
  const busy = blocks
    .filter((b) => b.startMinutes !== null && b.endMinutes !== null)
    .map((b) => [b.startMinutes as number, b.endMinutes as number] as const);
  return free.every((f) => !busy.some(([s, e]) => f.startMinutes < e && s < f.endMinutes));
}

/** The verdict is a function of the delta, so it must not contradict it. */
function verdictAgrees(verdict: string, delta: number): boolean {
  if (verdict === 'over') return delta < 0;
  if (verdict === 'open') return delta >= 0;
  // light / tight are thresholds in between; just require the sign to be sane.
  if (delta < 0) return verdict === 'over';
  return true;
}

console.log(`\n${pass} passed, ${fail} failed`);
await prisma.$disconnect();
process.exit(fail === 0 ? 0 : 1);
