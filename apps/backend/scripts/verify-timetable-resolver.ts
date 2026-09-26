/**
 * Unit checks for the timetable resolver.
 *
 * The resolver is the single place that decides what actually happens, so its
 * rules are pinned here rather than only through the API. Pure data, no
 * database: run with `npx tsx scripts/verify-timetable-resolver.ts`.
 */
import {
  resolveWeek,
  resolveDay,
  readSlots,
  weekStartOf,
  weekNumberOf,
  weekDates,
  generatesAttendance,
  termOrigin,
  type ResolvableCourse,
  type ResolvableEntry,
} from '../src/services/timetableResolver.js';

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
};

const MON = '2026-09-21'; // a Monday
check('weekStartOf resolves a Monday to itself', weekStartOf(MON) === MON, weekStartOf(MON));
check('weekStartOf pulls Sunday back to the Monday before', weekStartOf('2026-09-27') === MON, weekStartOf('2026-09-27'));
check(
  'weekStartOf pulls Saturday forward to its Monday',
  weekStartOf('2026-09-26') === MON,
  weekStartOf('2026-09-26'),
);
check('weekDates spans Mon..Sun', weekDates(MON).join(',') === `${MON},2026-09-22,2026-09-23,2026-09-24,2026-09-25,2026-09-26,2026-09-27`);

const course = (id: string, schedule: unknown): ResolvableCourse => ({
  id,
  name: `Course ${id}`,
  code: id.toUpperCase(),
  schedule,
});

const entry = (over: Partial<ResolvableEntry> & { id: string; date: string }): ResolvableEntry => ({
  courseId: null,
  title: 'Entry',
  kind: 'EVENT',
  startTime: null,
  endTime: null,
  location: null,
  replacesSlot: null,
  ...over,
});

const onDay = (week: ReturnType<typeof resolveWeek>, date: string) =>
  week.occurrences.filter((o) => o.date === date);

const alive = (week: ReturnType<typeof resolveWeek>, date: string) =>
  onDay(week, date).filter((o) => o.happens);

// ---- 1. reading slots ------------------------------------------------------

const legacy = readSlots([{ dayOfWeek: 1, startTime: '09:00', endTime: '10:30' }]);
check('a legacy three-field slot still reads', legacy.length === 1);
check('a slot with no type defaults to CLASS', legacy[0]?.type === 'CLASS', legacy[0]?.type);
check('a slot with no weekNumber recurs weekly', legacy[0]?.weekNumber === null);

check(
  'an unknown slot type is treated as CLASS, not dropped',
  readSlots([{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00', type: 'NONSENSE' }])[0]?.type === 'CLASS',
);
check(
  'optional fields are read when valid',
  (() => {
    const s = readSlots([
      { dayOfWeek: 3, startTime: '14:00', endTime: '16:00', type: 'LAB', weekNumber: 8, location: ' B-203 ' },
    ])[0];
    return s?.type === 'LAB' && s?.weekNumber === 8 && s?.location === 'B-203';
  })(),
);

const garbage = readSlots([
  null,
  'nope',
  42,
  { dayOfWeek: 7, startTime: '09:00', endTime: '10:00' },
  { dayOfWeek: 1, startTime: '9:00', endTime: '10:00' },
  { dayOfWeek: 1, startTime: '25:00', endTime: '26:00' },
  { dayOfWeek: 1, startTime: '10:00', endTime: '09:00' },
  { dayOfWeek: 1.5, startTime: '09:00', endTime: '10:00' },
]);
check('malformed slots are skipped', garbage.length === 0, JSON.stringify(garbage));
check('a non-array schedule reads as empty', readSlots(null).length === 0 && readSlots({}).length === 0);

// ---- 2. a plain week -------------------------------------------------------

const mon = course('c1', [
  { dayOfWeek: 1, startTime: '09:00', endTime: '10:30' },
  { dayOfWeek: 1, startTime: '14:00', endTime: '15:00', type: 'LAB', location: 'B-203' },
  { dayOfWeek: 3, startTime: '11:00', endTime: '12:00' },
]);

const plain = resolveWeek({ weekStart: MON, courses: [mon] });
check('the Monday slot appears on the Monday', alive(plain, MON).length === 2, String(alive(plain, MON).length));
check('the Monday slot does not leak into the Tuesday', alive(plain, '2026-09-22').length === 0);
check('the Wednesday slot appears on the Wednesday', alive(plain, '2026-09-23').length === 1);
check('a week with no courses has no occurrences', resolveWeek({ weekStart: MON, courses: [] }).occurrences.length === 0);
check('recurring slots do recur weeks later', resolveWeek({ weekStart: '2026-10-05', courses: [mon] }).occurrences.length === 3);
check('the lab slot keeps its type', alive(plain, MON)[1]?.type === 'LAB');
check('the lab slot keeps its location', alive(plain, MON)[1]?.location === 'B-203');
check('a recurring slot has no week restriction', alive(plain, MON)[0]?.weekNumber === null);

// ---- 3. weekNumber ---------------------------------------------------------

const weekOnly = course('c1', [
  { dayOfWeek: 1, startTime: '09:00', endTime: '10:00', weekNumber: 1 },
  { dayOfWeek: 1, startTime: '11:00', endTime: '12:00', weekNumber: 2 },
]);
const w1 = resolveWeek({ weekStart: MON, courses: [weekOnly], origin: MON });
check('term week numbering starts at 1 in the origin week', w1.weekNumber === 1, String(w1.weekNumber));
check('week 1 runs and week 2 does not', alive(w1, MON).map((o) => o.startTime).join() === '09:00');
const W2 = '2026-09-28';
const w2 = resolveWeek({ weekStart: W2, courses: [weekOnly], origin: MON });
check('the following week is week 2', w2.weekNumber === 2, String(w2.weekNumber));
check('week 2 runs and week 1 does not', alive(w2, W2).map((o) => o.startTime).join() === '11:00');
check('weekNumberOf counts from the origin', weekNumberOf('2026-10-19', MON) === 5, String(weekNumberOf('2026-10-19', MON)));
const wFar = resolveWeek({ weekStart: '2026-10-19', courses: [weekOnly], origin: MON });
check('a weekNumber slot is gone once its week has passed', alive(wFar, '2026-10-19').length === 0);

// ---- 4. holidays -----------------------------------------------------------

const holiday = resolveWeek({
  weekStart: MON,
  courses: [mon],
  entries: [entry({ id: 'e1', date: MON, kind: 'HOLIDAY', title: 'Founders Day' })],
});
check('a holiday cancels every slot that day', alive(holiday, MON).length === 1, String(alive(holiday, MON).length));
check('the only survivor is the holiday itself', alive(holiday, MON)[0]?.entryId === 'e1');
check('a holiday is not a recurring occurrence', alive(holiday, MON)[0]?.type === 'HOLIDAY');
check(
  'cancelled classes name the holiday, not just the word',
  onDay(holiday, MON).filter((o) => !o.happens).every((o) => o.cancelledReason === 'Founders Day'),
);
check('a holiday does not affect other days', alive(holiday, '2026-09-23').length === 1);

// ---- 5. exceptions ---------------------------------------------------------

const exception = resolveWeek({
  weekStart: MON,
  courses: [mon],
  entries: [
    entry({
      id: 'e2',
      date: MON,
      kind: 'EXCEPTION',
      courseId: 'c1',
      title: 'Lab cancelled',
      startTime: '14:00',
      endTime: '15:00',
    }),
  ],
});
check('an exception removes only the slot it names', alive(exception, MON).map((o) => o.startTime).join() === '09:00');
check('the removed slot explains itself', onDay(exception, MON).find((o) => o.startTime === '14:00')?.cancelledReason === 'Lab cancelled');
check('an exception is not itself rendered as an occurrence', onDay(exception, MON).filter((o) => o.entryId === 'e2').length === 0);
check(
  'an exception that matches nothing is inert',
  resolveWeek({
    weekStart: MON,
    courses: [mon],
    entries: [entry({ id: 'e3', date: MON, kind: 'EXCEPTION', courseId: 'c1', title: 'Ghost', startTime: '03:00', endTime: '04:00' })],
  }).occurrences.filter((o) => o.happens && o.date === MON).length === 2,
);

// ---- 6. rescheduled --------------------------------------------------------

const rescheduled = resolveWeek({
  weekStart: MON,
  courses: [mon],
  entries: [
    entry({
      id: 'e4',
      date: '2026-09-23', // Wednesday
      kind: 'RESCHEDULED',
      courseId: 'c1',
      title: 'Monday class moved to Wednesday',
      startTime: '10:00',
      endTime: '11:30',
      replacesSlot: { dayOfWeek: 1, startTime: '09:00', endTime: '10:30' },
    }),
  ],
});
check('the moved class leaves its original slot', alive(rescheduled, MON).map((o) => o.startTime).join() === '14:00');
check('the moved class is flagged as moved', onDay(rescheduled, MON).find((o) => o.startTime === '09:00')?.moved === true);
check(
  'the moved class says where it went',
  onDay(rescheduled, MON).find((o) => o.startTime === '09:00')?.cancelledReason === 'Rescheduled to 2026-09-23 10:00',
);
check('the moved class appears on its new date', alive(rescheduled, '2026-09-23').map((o) => o.startTime).join() === '10:00,11:00');
check('the moved class is a CLASS for attendance', alive(rescheduled, '2026-09-23').find((o) => o.startTime === '10:00')?.type === 'CLASS');

// ---- 7. exams and additions ------------------------------------------------

const exam = resolveWeek({
  weekStart: MON,
  courses: [mon],
  entries: [entry({ id: 'e5', date: '2026-09-22', kind: 'EXAM', courseId: 'c1', title: 'Midterm', startTime: '13:00', endTime: '16:00' })],
});
check('an exam is added to its date', alive(exam, '2026-09-22').map((o) => o.startTime).join() === '13:00');
check('an exam is typed EXAM', alive(exam, '2026-09-22')[0]?.type === 'EXAM');
check('an exam does not disturb the weekly slots', alive(exam, MON).length === 2);

check(
  'an entry outside the resolved week is ignored',
  resolveWeek({
    weekStart: MON,
    courses: [mon],
    entries: [entry({ id: 'e6', date: '2026-10-19', kind: 'EXAM', title: 'Far away' })],
  }).occurrences.length === 3, // mon has two Monday slots and one Wednesday slot
);
check(
  'an entry with no course still renders',
  resolveWeek({
    weekStart: MON,
    courses: [],
    entries: [entry({ id: 'e7', date: MON, kind: 'HOLIDAY', title: 'Campus closed' })],
  }).occurrences[0]?.courseId === '',
);

// ---- 8. ordering and a single day ------------------------------------------

const ordered = resolveWeek({
  weekStart: MON,
  courses: [course('c1', [{ dayOfWeek: 1, startTime: '15:00', endTime: '16:00' }])],
  entries: [entry({ id: 'e8', date: MON, kind: 'EVENT', title: 'Standup', startTime: '08:00', endTime: '08:15' })],
});
check(
  'occurrences come back ordered by date then time',
  ordered.occurrences.map((o) => o.startTime).join() === '08:00,15:00',
  ordered.occurrences.map((o) => o.startTime).join(),
);

const dayOnly = resolveDay(MON, [mon], [entry({ id: 'e9', date: MON, kind: 'HOLIDAY', title: 'Off' })]);
check('resolveDay returns only that date', dayOnly.every((o) => o.date === MON));
check('resolveDay applies the same holiday rule', dayOnly.filter((o) => o.happens).length === 1);

// ---- 9. attendance ---------------------------------------------------------

check('a CLASS that happens generates attendance', generatesAttendance(alive(plain, MON)[0]!));
check('a LAB does not generate attendance', !generatesAttendance(alive(plain, MON)[1]!));
check('a cancelled class does not generate attendance', !generatesAttendance(onDay(holiday, MON).find((o) => !o.happens)!));
check('a holiday does not generate attendance', !generatesAttendance(alive(holiday, MON)[0]!));
check('an exam does not generate attendance', !generatesAttendance(alive(exam, '2026-09-22')[0]!));

// ---- 10. the term's first week --------------------------------------------
// A `weekNumber` slot is relative to the start of term, which is the week of
// the user's oldest course. If a caller forgets to pass that origin, every
// requested week silently counts as week 1 and "week 5 only" runs all term.

const termStart = '2026-09-07'; // four weeks before MON
const weekFive = course('term5', [
  { dayOfWeek: 1, startTime: '09:00', endTime: '10:00', weekNumber: 5 },
]);

check(
  'termOrigin is the oldest course date',
  termOrigin([{ createdAt: new Date('2026-08-01T00:00:00Z') }, { createdAt: new Date('2026-09-07T00:00:00Z') }]) ===
    '2026-08-01',
);
check('termOrigin of no courses is undefined', termOrigin([]) === undefined);

check(
  'a week-5 slot does not run in term week 4',
  resolveWeek({ weekStart: '2026-09-28', courses: [weekFive], origin: termStart }).occurrences.length === 0,
);
check(
  'a week-5 slot runs in term week 5',
  resolveWeek({ weekStart: '2026-10-05', courses: [weekFive], origin: termStart }).occurrences.length === 1,
);
check(
  'resolveDay without an origin treats the week as term week 1',
  resolveDay('2026-10-05', [weekFive], [], termStart).length === 1 &&
    resolveDay('2026-10-05', [weekFive], []).length === 0,
);

// ---- 11. a class moved across a week boundary ------------------------------
// The reschedule is recorded against its *new* date, so a class leaving the
// week must still be found. That means reading a day is not enough: the
// resolver needs the neighbouring week in hand.

const sunday = '2026-09-27';
const nextMonday = '2026-09-28';
const sundayClass = course('sun', [{ dayOfWeek: 0, startTime: '11:00', endTime: '12:00' }]);
const movedOut = entry({
  id: 'move-out',
  date: nextMonday,
  kind: 'RESCHEDULED',
  courseId: 'sun',
  title: 'Sun class',
  startTime: '14:00',
  endTime: '15:00',
  replacesSlot: { dayOfWeek: 0, startTime: '11:00', endTime: '12:00' },
});

// The caller's window has to reach into the next week for this to work.
const outWindow = [movedOut];
const sundayWeek = resolveWeek({ weekStart: MON, courses: [sundayClass], entries: outWindow });
check(
  'a class moved into next Monday leaves the Sunday it was on',
  sundayWeek.occurrences.filter((o) => o.date === sunday).every((o) => !o.happens),
);
check(
  'the vacated Sunday marks the class as moved',
  sundayWeek.occurrences.find((o) => o.date === sunday)?.moved === true,
);
check(
  'a class moved into next Monday does not appear on that Monday',
  resolveWeek({ weekStart: nextMonday, courses: [sundayClass], entries: [] }).occurrences.filter(
    (o) => o.date === nextMonday,
  ).length === 0,
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
