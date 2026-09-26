/**
 * Checks for attendance generation and auto-marking.
 *
 * Both run as crons over *every* user, so they cannot be exercised against the
 * live account. These checks use a throwaway user instead: nothing here can
 * touch a real timetable or a real attendance record.
 *
 * The probe timetable is built around whatever day of the week this runs on, so
 * the checks mean the same thing on a Monday as on a Saturday.
 *
 * Run with `npx tsx scripts/verify-attendance-cron.ts`.
 */
import { readFile } from 'node:fs/promises';
import { prisma } from '../src/lib/prisma.js';
import { generateTodayAttendance, autoMarkStaleRecords } from '../src/services/attendanceCron.js';
import { dayKeyInTz } from '../src/lib/tz.js';

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
};

const EMAIL = 'zz-attendance-probe@example.invalid';
const TZ = 'Asia/Calcutta';
// The probe's "today", in the probe's own timezone.
const DAY = dayKeyInTz(new Date(), TZ);
const DOW = new Date(`${DAY}T12:00:00Z`).getUTCDay();
const add = (n: number) => {
  const ms = Date.parse(`${DAY}T00:00:00Z`) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
};
const TOMORROW = add(1);
const NEXT_WEEK = add(7);
// A wall-clock time in the probe's timezone, as an instant.
const localInstant = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  // Calcutta is UTC+5:30; the offset is fixed, so this needs no tz database.
  return new Date(Date.parse(`${day}T00:00:00Z`) + (h * 60 + m) * 60_000 - 5.5 * 3_600_000);
};

// These functions run over every user in production, and the scoping argument
// is the only thing keeping this script away from real records. An image older
// than that argument would ignore it and quietly touch live data, so the
// deployed source is checked before anything is created. `Function.length`
// cannot be used here: a default first parameter makes it zero.
const deployedSource = await readFile(
  new URL('../src/services/attendanceCron.ts', import.meta.url),
  'utf8',
);
for (const fn of ['generateTodayAttendance', 'autoMarkStaleRecords']) {
  // Bounded and lazy: the signature wraps across lines and `new Date()` brings
  // its own parentheses, so a `[^)]*` character class stops short.
  if (!new RegExp(`${fn}\\([\\s\\S]{0,200}?onlyUserId`).test(deployedSource)) {
    console.error(
      `refusing to run: the deployed ${fn} takes no userId scope, so these ` +
        'checks would touch real attendance records. Rebuild and redeploy the backend first.',
    );
    process.exit(1);
  }
}

const user = await prisma.user.create({
  data: { email: EMAIL, name: 'ZZ Attendance Probe', timezone: TZ, attendanceAutoMarkHours: 2 },
});

const course = await prisma.course.create({
  data: {
    userId: user.id,
    name: 'ZZ Attendance Course',
    code: 'ZZ1',
    schedule: [
      // Today: a class and a lab. One record covers the day, not one per slot.
      { dayOfWeek: DOW, startTime: "09:00", endTime: "10:00" },
      { dayOfWeek: DOW, startTime: "14:00", endTime: "15:30", type: "LAB" },
    ],
  },
});

// A second course whose only class is in term week 2, on the day after today.
const weekTwo = await prisma.course.create({
  data: {
    userId: user.id,
    name: 'ZZ Week Two Course',
    code: 'ZZ2',
    schedule: [{ dayOfWeek: (DOW + 1) % 7, startTime: "11:00", endTime: "12:00", weekNumber: 2 }],
  },
});

const mkEntry = (data: Record<string, unknown>) =>
  prisma.timetableEntry.create({
    data: { userId: user.id, courseId: course.id, title: "ZZ Entry", kind: "EVENT", ...data } as never,
  });

const records = (date: string) =>
  prisma.attendanceRecord.findMany({ where: { userId: user.id, date }, orderBy: { courseId: "asc" } });
const statusFor = async (date: string, courseId: string) =>
  (await records(date)).find((r) => r.courseId === courseId)?.status;
const reset = () =>
  prisma.attendanceRecord.updateMany({
    where: { userId: user.id },
    data: { status: "UNCONFIRMED", confirmedAt: null },
  });

try {
  // ---- generation --------------------------------------------------------
  await generateTodayAttendance(new Date(), user.id);

  check("a class day generates a record", (await records(DAY)).length === 1, `day ${DAY} dow ${DOW}`);
  check("the record starts unconfirmed", (await statusFor(DAY, course.id)) === "UNCONFIRMED");

  // Running twice must not duplicate: the upsert is keyed on course + date.
  await generateTodayAttendance(new Date(), user.id);
  check("a class and a lab on one day make one record", (await records(DAY)).length === 1);
  check("generating twice does not duplicate", (await records(DAY)).length === 1);

  // A week-2-only course must not generate anything in term week 1, and must in
  // term week 2. Without the term origin, "now" is always read as week 1 and the
  // second half of this can never pass.
  check(
    "a week-2-only course generates nothing in term week 1",
    (await records(TOMORROW)).filter((r) => r.courseId === weekTwo.id).length === 0,
  );
  // The week-2 class falls on tomorrow's weekday, one week later.
  const weekTwoDay = add(8);
  await generateTodayAttendance(localInstant(weekTwoDay, "09:00"), user.id);
  check(
    "a week-2-only course generates in term week 2",
    (await statusFor(weekTwoDay, weekTwo.id)) === "UNCONFIRMED",
    `expected a record on ${weekTwoDay}`,
  );
  // A slot with no weekNumber runs in every term week, including week 2.
  await generateTodayAttendance(localInstant(NEXT_WEEK, "09:00"), user.id);
  check(
    "a plain course still generates in term week 2",
    (await statusFor(NEXT_WEEK, course.id)) === "UNCONFIRMED",
    `expected a record on ${NEXT_WEEK}`,
  );
  await prisma.attendanceRecord.deleteMany({ where: { userId: user.id, date: { gte: NEXT_WEEK } } });

  // An exam entry alone must not create a record.
  const examOnly = await prisma.course.create({
    data: {
      userId: user.id,
      name: "ZZ Exam Only",
      code: "ZZ3",
      // No weekly class: the exam entry is the only thing on its timetable, so
      // any record would have to have come from the exam.
      schedule: [],
    },
  });
  await mkEntry({
    courseId: examOnly.id,
    title: "ZZ Exam",
    kind: "EXAM",
    date: add(2),
    startTime: "09:00",
    endTime: "11:00",
  });
  await generateTodayAttendance(localInstant(add(2), "09:00"), user.id);
  check("an exam does not generate a record", (await records(add(2))).length === 0);
  await prisma.course.delete({ where: { id: examOnly.id } });

  // A day-wide holiday cancels a record that was already generated.
  const holiday = await mkEntry({ title: "ZZ Holiday", kind: "HOLIDAY", date: DAY });
  await generateTodayAttendance(new Date(), user.id);
  check("a holiday cancels an existing unconfirmed record", (await statusFor(DAY, course.id)) === "CANCELLED");
  await prisma.timetableEntry.delete({ where: { id: holiday.id } });

  // An exception naming the 09:00 slot cancels the day's record.
  const exception = await mkEntry({
    title: "ZZ Cancel 9",
    kind: "EXCEPTION",
    date: DAY,
    startTime: "09:00",
    endTime: "10:00",
  });
  await generateTodayAttendance(new Date(), user.id);
  check("an exception cancels an existing unconfirmed record", (await statusFor(DAY, course.id)) === "CANCELLED");
  await prisma.timetableEntry.delete({ where: { id: exception.id } });

  // A reschedule away from the class day cancels the record too.
  const reschedule = await mkEntry({
    title: "ZZ Moved",
    kind: "RESCHEDULED",
    date: TOMORROW,
    startTime: "16:00",
    endTime: "17:00",
    replacesSlot: { dayOfWeek: DOW, startTime: "09:00", endTime: "10:00" },
  });
  await generateTodayAttendance(new Date(), user.id);
  check("a reschedule away cancels an existing unconfirmed record", (await statusFor(DAY, course.id)) === "CANCELLED");
  await prisma.timetableEntry.delete({ where: { id: reschedule.id } });

  // ---- auto-mark ---------------------------------------------------------
  // 09:30 local: the class is still running, so nothing is stale yet.
  await reset();
  await autoMarkStaleRecords(localInstant(DAY, "09:30"), user.id);
  check("a class still running is left alone", (await statusFor(DAY, course.id)) === "UNCONFIRMED");

  // The record exists because the 09:00 class was due, and the lab does not
  // generate attendance, so the lab deliberately does not hold the record open.
  // Waiting for the end of the whole day would report someone present for a
  // class they skipped.
  await reset();
  await autoMarkStaleRecords(localInstant(DAY, "13:00"), user.id);
  check("the clock runs from the class, not from the last lab", (await statusFor(DAY, course.id)) === "ATTENDED");

  // 10:30 local: the class has only just ended, inside the 2h threshold.
  await reset();
  await autoMarkStaleRecords(localInstant(DAY, "10:30"), user.id);
  check("a day inside the auto-mark threshold is left open", (await statusFor(DAY, course.id)) === "UNCONFIRMED");

  // 19:00 local: everything is over and past the threshold.
  await reset();
  await autoMarkStaleRecords(localInstant(DAY, "19:00"), user.id);
  check("a finished day is auto-marked present", (await statusFor(DAY, course.id)) === "ATTENDED");

  // An exception means the class never ran, so the record is cancelled rather
  // than marked present: the user was never expected to be there.
  await reset();
  const exc2 = await mkEntry({
    title: "ZZ Cancel 9",
    kind: "EXCEPTION",
    date: DAY,
    startTime: "09:00",
    endTime: "10:00",
  });
  await autoMarkStaleRecords(localInstant(DAY, "19:00"), user.id);
  check("an exception makes auto-mark cancel, not present", (await statusFor(DAY, course.id)) === "CANCELLED");
  await prisma.timetableEntry.delete({ where: { id: exc2.id } });

  // A holiday for the whole day has the same effect.
  await reset();
  const hol2 = await mkEntry({ title: "ZZ Holiday", kind: "HOLIDAY", date: DAY });
  await autoMarkStaleRecords(localInstant(DAY, "19:00"), user.id);
  check("a holiday makes auto-mark cancel, not present", (await statusFor(DAY, course.id)) === "CANCELLED");
  await prisma.timetableEntry.delete({ where: { id: hol2.id } });

  // A leftover record for a day with no class at all is cancelled, not present.
  await reset();
  const classless = await prisma.course.create({
    data: { userId: user.id, name: "ZZ Classless", code: "ZZ4", schedule: [] },
  });
  const spare = await prisma.attendanceRecord.create({
    data: { userId: user.id, courseId: classless.id, date: DAY, status: "UNCONFIRMED" },
  });
  await autoMarkStaleRecords(localInstant(DAY, "19:00"), user.id);
  const spareRow = await prisma.attendanceRecord.findUnique({ where: { id: spare.id } });
  check(
    "a leftover record for a classless day is cancelled",
    spareRow?.status === "CANCELLED",
    String(spareRow?.status),
  );

  // A user who has opted out of auto-mark keeps their unconfirmed records.
  await reset();
  await prisma.user.update({ where: { id: user.id }, data: { attendanceAutoMarkHours: null } });
  await autoMarkStaleRecords(localInstant(DAY, "19:00"), user.id);
  check("opting out of auto-mark keeps the record unconfirmed", (await statusFor(DAY, course.id)) === "UNCONFIRMED");
} finally {
  // The user cascades to courses, entries and records.
  await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  const leftoverUser = await prisma.user.findUnique({ where: { email: EMAIL } });
  const leftoverRecords = await prisma.attendanceRecord.count({ where: { user: { email: EMAIL } } });
  const leftoverCourses = await prisma.course.count({ where: { user: { email: EMAIL } } });
  const leftoverEntries = await prisma.timetableEntry.count({ where: { user: { email: EMAIL } } });
  check("no probe user survives", leftoverUser === null);
  check("no probe attendance record survives", leftoverRecords === 0, String(leftoverRecords));
  check("no probe course survives", leftoverCourses === 0, String(leftoverCourses));
  check("no probe entry survives", leftoverEntries === 0, String(leftoverEntries));
  await prisma.$disconnect();
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
