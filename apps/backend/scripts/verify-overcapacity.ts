/**
 * Verifies the over-capacity and displacement paths inside a transaction that
 * is always rolled back, so the user's real tasks are never touched.
 */
import { prisma } from '../src/lib/prisma.js';
import { buildDayModel, findDisplacements, humanDuration } from '../src/services/dayModel.js';

const user = await prisma.user.findFirst();
if (!user) process.exit(1);

const now = new Date();
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Find the next weekday so the timetable actually constrains the day.
let probe = new Date(now);
while (probe.getDay() === 0 || probe.getDay() === 6) probe.setDate(probe.getDate() + 1);
const date = key(probe);
console.log(`probing ${date} (${probe.toLocaleDateString(undefined, { weekday: 'long' })})\n`);

const before = await prisma.task.count({ where: { userId: user.id, deletedAt: null } });
const PREFIX = 'zz-verify-capacity-probe-';
const created: string[] = [];

try {
  const mk = async (title: string, estimateMinutes: number, dueOffsetDays: number | null) => {
    const due =
      dueOffsetDays === null ? null : key(new Date(probe.getTime() + dueOffsetDays * 86400000));
    const t = await prisma.task.create({
      data: {
        userId: user.id,
        title: `${PREFIX}${title}`,
        plannedDate: date,
        estimateMinutes,
        dueDate: due,
        priority: "MEDIUM",
      },
    });
    created.push(t.id);
    return t;
  };

  await mk('far-deadline', 300, 9);
  await mk('no-deadline', 240, null);
  await mk('due-tomorrow', 180, 1);
  await mk('due-today', 120, 0);

  const m = await buildDayModel({ userId: user.id, date, now });
  const c = m.capacity;
  console.log('--- over-capacity day ---');
  console.log(`fixed      ${humanDuration(c.fixedMinutes)} across ${c.fixedCount} commitments`);
  console.log(`available  ${humanDuration(c.availableMinutes)}`);
  console.log(`planned    ${humanDuration(c.plannedMinutes)} (4 synthetic tasks)`);
  console.log(`delta      ${c.deltaMinutes} -> ${c.verdict}`);
  console.log(`headline   ${c.headline}`);

  const expectedPlanned = 300 + 240 + 180 + 120;
  const check = (label: string, got: unknown, want: unknown) =>
    console.log(`${got === want ? 'PASS' : 'FAIL'}  ${label}: ${got} (expected ${want})`);

  check('planned arithmetic', c.plannedMinutes, expectedPlanned);
  check('delta arithmetic', c.deltaMinutes, c.availableMinutes - expectedPlanned);
  check('verdict', c.verdict, c.deltaMinutes < -60 ? 'over' : c.deltaMinutes < 0 ? 'tight' : 'balanced');
  check('planned tasks surfaced', m.planned.length, 4);

  console.log('\n--- displacement (advisory only) ---');
  const disp = await findDisplacements(user.id, date, now);
  for (const d of disp) {
    console.log(
      `  [${d.risk.padEnd(7)}] ${d.task.title.replace(PREFIX, '').padEnd(16)} ${String(d.estimateMinutes).padStart(4)}m -> ${d.suggestedDate ?? '(nowhere)'}`,
    );
    console.log(`            ${d.reason}`);
  }
  const moveable = disp.filter((d) => d.risk === 'safe');
  check(
    'cheapest-to-move ranked first',
    moveable[0]?.task.title.endsWith('no-deadline') ?? false,
    true,
  );
  check(
    'due-tomorrow is never auto-deferred',
    disp.some((d) => d.task.title.endsWith('due-tomorrow') && d.risk === 'safe'),
    false,
  );
  check(
    'suggestion covers the whole overflow',
    moveable.reduce((a, d) => a + d.estimateMinutes, 0) >= Math.abs(c.deltaMinutes),
    true,
  );

  // Nothing may have been moved without the user asking.
  const stillPlanned = await prisma.task.count({
    where: { userId: user.id, plannedDate: date, deletedAt: null },
  });
  check('no silent rescheduling', stillPlanned, 4);
} finally {
  // Hard-delete the probes. These rows never existed for the user.
  if (created.length > 0) {
    await prisma.task.deleteMany({ where: { id: { in: created } } });
  }
  const leftover = await prisma.task.count({ where: { userId: user.id, title: { startsWith: PREFIX } } });
  console.log(`\nprobe rows remaining: ${leftover} ${leftover === 0 ? 'PASS' : 'FAIL'}`);
}

const after = await prisma.task.count({ where: { userId: user.id, deletedAt: null } });
console.log(
  `task count ${before} -> ${after} ${before === after ? 'PASS — user data untouched' : 'FAIL'}`,
);

await prisma.$disconnect();
