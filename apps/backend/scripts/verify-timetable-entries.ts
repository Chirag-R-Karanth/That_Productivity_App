/**
 * End-to-end check of timetable entries against a running API.
 *
 * Creates a throwaway course and exercises the resolved week end to end:
 * holidays clearing a day, exams being added, exceptions cancelling one class,
 * reschedules moving a class to another day, and the day model agreeing.
 *
 * Assertions are scoped to the probe course. The user running this has a real
 * timetable, and a week-wide count would fail for reasons that have nothing to
 * do with the code under test.
 *
 * Usage (inside the backend container, so no database port has to be exposed):
 *   API=http://localhost:4000 npx tsx scripts/verify-timetable-entries.ts
 */
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';
import { assertApiTarget, resolveTargetUser } from './lib/target.js';
import { addDaysTz as addDays } from '../src/lib/tz.js';
import { weekStartOf } from '../src/services/timetableResolver.js';
import type { TimetableOccurrence } from '@prodapp/shared-types';

const API = (process.env.API ?? 'http://localhost:4000').replace(/\/$/, '');

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
};

const user = await resolveTargetUser(prisma);
const token = await signToken({ id: user.id, email: user.email });
await assertApiTarget({ base: API, token });

type Json = Record<string, unknown>;
async function call<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T | null; body: Json }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const parsed = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, data: (parsed.data ?? null) as T | null, body: parsed };
}

type Occurrence = {
  key: string;
  courseId: string;
  courseName: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  happens: boolean;
  cancelledReason: string | null;
  moved: boolean;
  entryId: string | null;
  location: string | null;
};
type Week = {
  weekStart: string;
  weekNumber: number;
  occurrences: Occurrence[];
  entries: { id: string; courseId: string | null; kind: string; title: string }[];
};
type TimelineBlock = { kind: string; title: string; source: string; startMinutes: number | null };

const PROBE = 'ZZ Timetable Probe';
const weekStart = weekStartOf(new Date().toISOString().slice(0, 10));
const mon = weekStart;
const tue = addDays(weekStart, 1);
const wed = addDays(weekStart, 2);

let courseId: string | null = null;
const entryIds: string[] = [];

/**
 * Only the probe's own occurrences, so a real timetable cannot fail this.
 * Entries with no course (a holiday, say) belong to the probe too, so they are
 * matched on the entry ids this run created.
 */
const isProbe = (o: Occurrence) =>
  o.courseId === courseId || (o.entryId !== null && entryIds.includes(o.entryId));
const mine = (week: Week | null, date?: string) =>
  (week?.occurrences ?? []).filter(isProbe).filter((o) => date === undefined || o.date === date);
const live = (week: Week | null, date: string) => mine(week, date).filter((o) => o.happens);
const myEntries = (week: Week | null) =>
  (week?.entries ?? []).filter((e) => entryIds.includes(e.id) || e.courseId === courseId);

const week = async (start: string) => (await call<Week>('GET', `/api/timetable/week?week=${start}`)).data;

const dayBlocks = async (date: string) => {
  const d = await call<{ timeline: TimelineBlock[] }>('GET', `/api/day?date=${date}`);
  // The probe's blocks, by title: the day model carries real data too.
  return (d.data?.timeline ?? []).filter((b) => b.title === PROBE || b.title.startsWith('ZZ '));
};

try {
  // ---- a course with a class, a lab, and a week-2-only slot -------------
  const course = await call<{ id: string }>('POST', '/api/courses', {
    name: PROBE,
    code: 'ZZTP',
    schedule: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
      { dayOfWeek: 1, startTime: '14:00', endTime: '15:30', type: 'LAB', location: 'B-101' },
      { dayOfWeek: 3, startTime: '11:00', endTime: '12:00', weekNumber: 2 },
    ],
  });
  check('a course with typed slots is created', course.status === 201, `got ${course.status}`);
  courseId = course.data?.id ?? null;
  if (!courseId) throw new Error('cannot continue without a course');

  // The optional fields must survive the save; zod strips unknown keys.
  // There is no GET /api/courses/:id, so read the list and pick the probe out.
  const list = await call<{ id: string; schedule: { type?: string; weekNumber?: number | null; location?: string | null }[] }[]>(
    'GET',
    '/api/courses',
  );
  const saved = (list.data ?? []).find((c) => c.id === courseId)?.schedule ?? [];
  check('the LAB type survived the save', saved[1]?.type === 'LAB', JSON.stringify(saved[1]));
  check('the location survived the save', saved[1]?.location === 'B-101', JSON.stringify(saved[1]));
  check('the week restriction survived the save', saved[2]?.weekNumber === 2, JSON.stringify(saved[2]));

  let w = await week(mon);
  check('the plain class shows on its Monday', live(w, mon).some((o) => o.startTime === '09:00'));
  check('the lab shows as a LAB', live(w, mon).find((o) => o.startTime === '14:00')?.type === 'LAB');
  check('the lab keeps its location', live(w, mon).find((o) => o.startTime === '14:00')?.location === 'B-101');
  // Term week 1 is the week of the user's *earliest* course, so which term week
  // "now" is depends on real data. Navigate to term weeks 2 and 4 and compare.
  const currentTermWeek = w?.weekNumber ?? 1;
  check('the week reports its number', Number.isInteger(currentTermWeek), String(currentTermWeek));
  const w2 = await week(addDays(mon, (2 - currentTermWeek) * 7));
  check('navigating back lands on term week 2', w2?.weekNumber === 2, String(w2?.weekNumber));
  check('a week-2-only slot runs in term week 2', mine(w2, wed).some((o) => o.startTime === '11:00'));
  const w4 = await week(addDays(mon, (4 - currentTermWeek) * 7));
  check('a week-2-only slot does not run in term week 4', !mine(w4, wed).some((o) => o.startTime === '11:00'));

  // The calendar reads this range endpoint rather than expanding the schedule
  // itself, so it must agree with the weekly grid.
  const range = await call<TimetableOccurrence[]>(
    'GET',
    `/api/timetable/occurrences?from=${mon}&to=${wed}`,
  );
  const ranged = (range.data ?? []).filter(isProbe);
  check('the range endpoint answers', range.status === 200, `got ${range.status}`);
  check(
    'the range endpoint returns the same Monday class',
    ranged.some((o) => o.date === mon && o.startTime === '09:00'),
  );
  check(
    'the range endpoint returns the same Monday lab',
    ranged.some((o) => o.date === mon && o.startTime === '14:00' && o.type === 'LAB'),
  );
  check(
    'the range endpoint omits the week-2-only slot in another week',
    !(await call<TimetableOccurrence[]>('GET', `/api/timetable/occurrences?from=${addDays(mon, 21)}&to=${addDays(mon, 23)}`))
      .data!.filter(isProbe)
      .some((o) => o.startTime === '11:00'),
  );
  check(
    'the range endpoint rejects a missing range',
    (await call('GET', '/api/timetable/occurrences')).status === 400,
  );
  check(
    'the range endpoint rejects an inverted range',
    (await call('GET', `/api/timetable/occurrences?from=${wed}&to=${mon}`)).status === 400,
  );

  // ---- an exam is an addition -------------------------------------------
  const exam = await call<{ id: string; courseName: string | null }>('POST', '/api/timetable/entries', {
    courseId,
    title: 'ZZ Midterm',
    kind: 'EXAM',
    date: tue,
    startTime: '13:00',
    endTime: '15:00',
    location: 'Hall 2',
  });
  check('an exam entry is created', exam.status === 201, `got ${exam.status}`);
  check('the entry carries its course name', exam.data?.courseName === PROBE);
  entryIds.push(exam.data!.id);

  w = await week(mon);
  check('the exam appears on its date', live(w, tue).some((o) => o.startTime === '13:00'));
  check('the exam is typed EXAM', live(w, tue).find((o) => o.startTime === '13:00')?.type === 'EXAM');
  check('the exam does not disturb the Monday', live(w, mon).length === 2, String(live(w, mon).length));
  check('the week reports the entry', myEntries(w).length === 1, String(myEntries(w).length));

  // ---- a holiday clears the day -----------------------------------------
  const holiday = await call<{ id: string }>('POST', '/api/timetable/entries', {
    title: 'ZZ Campus Holiday',
    kind: 'HOLIDAY',
    date: mon,
  });
  check('a holiday entry is created', holiday.status === 201, `got ${holiday.status}`);
  entryIds.push(holiday.data!.id);

  w = await week(mon);
  check('a holiday clears every class that day', live(w, mon).length === 1, String(live(w, mon).length));
  check('the only survivor is the holiday', live(w, mon)[0]?.type === 'HOLIDAY');
  check(
    'the cleared classes say why',
    mine(w, mon).filter((o) => !o.happens).every((o) => o.cancelledReason === 'ZZ Campus Holiday'),
  );
  check('the holiday has no times', live(w, mon)[0]?.startTime === '00:00');

  const onHoliday = await dayBlocks(mon);
  check('the day model shows only the holiday', onHoliday.length === 1, JSON.stringify(onHoliday.map((b) => b.title)));
  check('the day model types the holiday as an event', onHoliday[0]?.kind === 'event', onHoliday[0]?.kind);

  // Take the holiday back off before testing the narrower exception rules.
  const dropHoliday = await call('DELETE', `/api/timetable/entries/${holiday.data!.id}`);
  check('the holiday can be removed', dropHoliday.status === 200, `got ${dropHoliday.status}`);
  entryIds.pop();

  // ---- an exception cancels one class ------------------------------------
  const exception = await call<{ id: string }>('POST', '/api/timetable/entries', {
    courseId,
    title: 'ZZ Lab off',
    kind: 'EXCEPTION',
    date: mon,
    startTime: '14:00',
    endTime: '15:30',
  });
  check('an exception entry is created', exception.status === 201, `got ${exception.status}`);
  entryIds.push(exception.data!.id);

  w = await week(mon);
  check(
    'an exception cancels only the slot it names',
    live(w, mon).map((o) => o.startTime).join() === '09:00',
    live(w, mon).map((o) => o.startTime).join(),
  );
  check(
    'the cancelled lab explains itself',
    mine(w, mon).find((o) => o.startTime === '14:00')?.cancelledReason === 'ZZ Lab off',
  );
  check('the day model drops the cancelled lab', (await dayBlocks(mon)).length === 1);

  const dropException = await call('DELETE', `/api/timetable/entries/${exception.data!.id}`);
  check('the exception can be removed', dropException.status === 200, `got ${dropException.status}`);
  entryIds.pop();

  // ---- a reschedule moves a class ----------------------------------------
  const moved = await call<{ id: string }>('POST', '/api/timetable/entries', {
    courseId,
    title: 'ZZ Class moved',
    kind: 'RESCHEDULED',
    date: wed,
    startTime: '10:00',
    endTime: '11:00',
    replacesSlot: { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
  });
  check('a reschedule entry is created', moved.status === 201, `got ${moved.status}`);
  entryIds.push(moved.data!.id);

  w = await week(mon);
  check(
    'the moved class leaves its Monday slot',
    !live(w, mon).some((o) => o.startTime === '09:00'),
    live(w, mon).map((o) => o.startTime).join(),
  );
  check('the moved class is marked on its old slot', mine(w, mon).find((o) => o.startTime === '09:00')?.moved === true);
  check('the moved class appears on its new day', live(w, wed).some((o) => o.startTime === '10:00'));
  check('the moved class is a CLASS', live(w, wed).find((o) => o.startTime === '10:00')?.type === 'CLASS');

  const wedBlocks = await dayBlocks(wed);
  const movedBlock = wedBlocks.find((b) => b.startMinutes === 600);
  check('the day model shows the moved class at the new time', Boolean(movedBlock), JSON.stringify(wedBlocks.map((b) => b.startMinutes)));
  check('the moved class is not still on the Monday', !(await dayBlocks(mon)).some((b) => b.startMinutes === 540));

  // ---- validation --------------------------------------------------------
  const badDate = await call('POST', '/api/timetable/entries', { title: 'ZZ', date: '2026-02-30' });
  check('a date that does not exist is rejected', badDate.status === 400, `got ${badDate.status}`);
  const badTime = await call('POST', '/api/timetable/entries', { title: 'ZZ', date: tue, startTime: '10:00', endTime: '09:00' });
  check('an end before the start is rejected', badTime.status === 400, `got ${badTime.status}`);
  const badKind = await call('POST', '/api/timetable/entries', { title: 'ZZ', date: tue, kind: 'NONSENSE' });
  check('an unknown kind is rejected', badKind.status === 400, `got ${badKind.status}`);
  const foreignCourse = await call('POST', '/api/timetable/entries', { title: 'ZZ', date: tue, courseId: 'cmu-does-not-exist' });
  check("another user's course is rejected", foreignCourse.status === 400, `got ${foreignCourse.status}`);
  const noTitle = await call('POST', '/api/timetable/entries', { date: tue });
  check('an entry needs a title', noTitle.status === 400, `got ${noTitle.status}`);
  const notFound = await call('DELETE', '/api/timetable/entries/cmu-does-not-exist');
  check('deleting an unknown entry is a 404', notFound.status === 404, `got ${notFound.status}`);
  const noCourse = await call<{ id: string }>('POST', '/api/timetable/entries', { title: 'ZZ no course', date: tue, kind: 'EVENT' });
  check('an entry needs no course', noCourse.status === 201, `got ${noCourse.status}`);
  entryIds.push(noCourse.data!.id);

  // ---- editing -----------------------------------------------------------
  const edit = await call<{ title: string }>('PATCH', `/api/timetable/entries/${exam.data!.id}`, {
    title: 'ZZ Midterm renamed',
  });
  check('an entry can be renamed', edit.status === 200 && edit.data?.title === 'ZZ Midterm renamed', `got ${edit.status}`);
  const detach = await call<{ courseId: string | null }>('PATCH', `/api/timetable/entries/${exam.data!.id}`, { courseId: null });
  check('an entry can be detached from its course', detach.data?.courseId === null);
  const reattach = await call<{ courseId: string | null }>('PATCH', `/api/timetable/entries/${exam.data!.id}`, { courseId });
  check('an entry can be reattached to its course', reattach.data?.courseId === courseId);

  // ---- a snapshot carries the entries ------------------------------------
  // The export is the snapshot at the top level, not wrapped in `data`.
  const exported = await fetch(`${API}/api/sync/export`, { headers: { Authorization: `Bearer ${token}` } });
  const snapshot = (await exported.json().catch(() => ({}))) as { timetableEntries?: unknown[] };
  const exportedIds = new Set(
    (snapshot.timetableEntries ?? [])
      .map((e) => (e as { id: string }).id)
      .filter((id) => entryIds.includes(id)),
  );
  check(
    'the snapshot includes every entry the probe created',
    exportedIds.size === entryIds.length,
    `${exportedIds.size} of ${entryIds.length}`,
  );
} finally {
  // ---- cleanup, verified ------------------------------------------------
  // Deleting through the API is the path under test, and a silent no-op here
  // would leave rows in the user's real database.
  let removed = 0;
  for (const id of entryIds) {
    const res = await call('DELETE', `/api/timetable/entries/${id}`);
    if (res.status === 200) removed++;
    else console.log(`  cleanup: entry ${id} -> ${res.status}`);
  }
  if (courseId) {
    const res = await call('DELETE', `/api/courses/${courseId}`);
    if (res.status !== 200) console.log(`  cleanup: course -> ${res.status}`);
  }
  check('every entry the probe created was removed', removed === entryIds.length, `${removed} of ${entryIds.length}`);

  const leftover = await prisma.timetableEntry.count({
    where: { userId: user.id, title: { startsWith: 'ZZ ' } },
  });
  const leftoverCourse = await prisma.course.count({
    where: { userId: user.id, name: PROBE },
  });
  check('no probe entries survive in the database', leftover === 0, String(leftover));
  check('no probe course survives in the database', leftoverCourse === 0, String(leftoverCourse));
  await prisma.$disconnect();
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
