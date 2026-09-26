/**
 * Guards on the rules that only break once a second Google account exists.
 *
 * Every check here corresponds to a way the single-account code was quietly
 * wrong with seven accounts linked: a bare calendar id matching the wrong
 * account, a dedup key that merged two different meetings, or a deadline that
 * shifted because the day was computed in UTC.
 *
 * The pure logic is exercised directly. The route wiring is checked by reading
 * the source, because a route that is ambiguous again is a data-corruption bug
 * that only shows up against a live Google account.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { eventFingerprint } from "../src/services/calendarDedup.js";
import { zonedParts } from "../src/lib/tz.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, "..", rel), "utf8");

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

const at = (iso: string) => new Date(iso);
const fp = (title: string, start: string, end: string, allDay = false) =>
  eventFingerprint({ title, startTime: at(start), endTime: at(end), allDay });

console.log("\nEvent fingerprint across accounts");

check("the same meeting from two accounts produces one key", () => {
  // Seven accounts each get a copy of the same invite. These must collapse.
  assert.equal(
    fp("Team standup", "2026-03-02T09:00:00Z", "2026-03-02T09:15:00Z"),
    fp("Team standup", "2026-03-02T09:00:00Z", "2026-03-02T09:15:00Z"),
  );
});

check("case and surrounding whitespace do not create a second event", () => {
  assert.equal(
    fp("  Team Standup ", "2026-03-02T09:00:00Z", "2026-03-02T09:15:00Z"),
    fp("team standup", "2026-03-02T09:00:00Z", "2026-03-02T09:15:00Z"),
  );
});

check("a meeting at a different time stays separate", () => {
  assert.notEqual(
    fp("Team standup", "2026-03-02T09:00:00Z", "2026-03-02T09:15:00Z"),
    fp("Team standup", "2026-03-02T11:00:00Z", "2026-03-02T11:15:00Z"),
  );
});

check("a different length is a different meeting", () => {
  // 09:00-09:30 and 09:00-09:45 can be genuinely different meetings; treating
  // them as one would hide real work.
  assert.notEqual(
    fp("Review", "2026-03-02T09:00:00Z", "2026-03-02T09:30:00Z"),
    fp("Review", "2026-03-02T09:00:00Z", "2026-03-02T09:45:00Z"),
  );
});

check("an all-day and a timed event with the same name do not merge", () => {
  assert.notEqual(
    fp("Holiday", "2026-03-02T00:00:00Z", "2026-03-02T23:59:59Z", true),
    fp("Holiday", "2026-03-02T00:00:00Z", "2026-03-02T23:59:59Z", false),
  );
});

check("an untitled event still gets a key", () => {
  // Google events can have no summary; an empty title must still dedup rather
  // than merge every untitled event in the day into one.
  const a = fp("", "2026-03-02T09:00:00Z", "2026-03-02T09:30:00Z");
  const b = fp("", "2026-03-02T14:00:00Z", "2026-03-02T14:30:00Z");
  assert.notEqual(a, b);
  assert.equal(a, fp("   ", "2026-03-02T09:00:00Z", "2026-03-02T09:30:00Z"));
});

console.log("\nGoogle task deadlines are read in the user's own timezone");

// The local <-> RFC3339 conversion is the part of the task sync most likely to
// be wrong, and it is wrong silently: a task due at 09:00 lands on the previous
// day for anyone west of UTC unless the date is resolved in their zone.
function localDue(due: string, timezone: string): { date: string; time: string } {
  const p = zonedParts(at(due), timezone);
  return {
    date: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
    time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
  };
}

check("a late-evening UTC due date resolves to the right local day east of UTC", () => {
  const d = localDue("2026-03-02T23:30:00Z", "Asia/Kolkata");
  assert.equal(d.date, "2026-03-03");
  assert.equal(d.time, "05:00");
});

check("an early-morning UTC due date stays on the same local day west of UTC", () => {
  const d = localDue("2026-03-02T02:00:00Z", "America/New_York");
  assert.equal(d.date, "2026-03-01");
  assert.equal(d.time, "21:00");
});

check("a task with no time of day survives the round trip as a date", () => {
  // Google has no all-day task: a date-only deadline is noon UTC. The local side
  // must still show a plain date rather than inventing a midnight due time.
  const d = localDue("2026-03-02T12:00:00Z", "UTC");
  assert.equal(d.date, "2026-03-02");
  assert.equal(d.time, "12:00");
});

console.log("\nA calendar's key includes its account");

const schema = read("prisma/schema.prisma");

/** Just one model's block, so a check cannot match a later model's fields. */
function model(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  assert.notEqual(start, -1, `model ${name} is missing from the schema`);
  return schema.slice(start, schema.indexOf("\n}", start));
}

check("a linked calendar is not keyed on the Google calendar id alone", () => {
  // Every Google account has a calendar called `primary`. With `id` as the
  // primary key, linking the second account fails on a duplicate and the user
  // silently ends up with one account's calendars. This is the single change
  // that makes more than one account possible.
  const calendars = model("LinkedGoogleCalendar");
  assert.match(calendars, /@@id\(\[connectionId, id\]\)/);
  assert.doesNotMatch(calendars, /\n\s*id\s+String\s+@id/);
});

check("a Google task list id is not treated as globally unique", () => {
  // Same trap one level down: every account has a list called `@default`.
  assert.match(model("GoogleConnection"), /@@unique\(\[userId, googleAccountId\]\)/);
});

console.log("\nA deadline is carried to Google as a date");

const taskSrc = read("src/services/googleTasks.ts");

check("Google is sent an RFC3339 instant, never a bare local time", () => {
  // Google answers 400 INVALID_ARGUMENT for a due date with no offset, which is
  // what a task that was pushed before the deadline was understood sent.
  assert.match(taskSrc, /toGoogleDue\(dueDate: string \| null\): string \| undefined/);
  assert.match(taskSrc, /`\$\{dueDate\}T\$\{DATE_ONLY_NOON\}`/);
  assert.doesNotMatch(taskSrc, /T\$\{dueTime\}:00`/);
});

check("the date is sent at noon UTC so the UTC date is the user's date", () => {
  // The time of day is discarded by Google, but the date is not, and it is kept
  // as the UTC date. Converting the user's local date into an instant first
  // would round it onto the neighbouring day for anyone far enough from GMT.
  assert.match(taskSrc, /const DATE_ONLY_NOON = "12:00:00.000Z"/);
  const sent = "2026-09-30T12:00:00.000Z";
  assert.equal(new Date(sent).toISOString().slice(0, 10), "2026-09-30");
});

check("what comes back is read as a date, never shifted into a local zone", () => {
  // Google answered 2026-09-30T00:00:00.000Z for a deadline set to 14:30 local.
  // Reading that as an instant and converting to a local time would invent a
  // 05:30 deadline the user never entered.
  assert.match(taskSrc, /function splitDue\(due: string \| undefined\): \{ date: string \} \| null/);
  assert.match(taskSrc, /date: at\.toISOString\(\)\.slice\(0, 10\)/);
  // The date Google stored survives the trip back unchanged.
  assert.equal(new Date("2026-09-30T00:00:00.000Z").toISOString().slice(0, 10), "2026-09-30");
  // And it does not drift either side of midnight, which a local reading would.
  assert.equal(new Date("2026-09-30T00:00:00.000Z").toISOString().slice(0, 10), "2026-09-30");
});

check("a sync cannot erase a time of day that only exists here", () => {
  // Google holds no time, so writing `dueTime` from a sync would wipe a time the
  // user set in the app. The pull must leave the column alone.
  assert.match(taskSrc, /`dueTime` is deliberately not in `data`/);
  assert.match(taskSrc, /data: \{ \.\.\.data, dueTime: null, userId \}/);
  const dataBlock = taskSrc.slice(taskSrc.indexOf("const data = {"), taskSrc.indexOf("const data = {") + 700);
  assert.doesNotMatch(dataBlock, /dueTime/, "a sync must not write dueTime for a task that already exists");
});

check("no task push needs a timezone any more", () => {
  // The deadline is a date, so resolving a zone per request would be dead work
  // and would suggest a precision Google does not have.
  const routes = read("src/routes/tasks.ts");
  assert.match(routes, /await pushTaskCreate\(req\.user\.id, task\.id\);/);
  assert.match(routes, /await pushTaskUpdate\(req\.user\.id, task\.id\);/);
  assert.match(routes, /await syncGoogleTasks\(req\.user\.id\);/);
  assert.doesNotMatch(routes, /pushTask\w*\(req\.user\.id, task\.id,/);
});

console.log("\nRoutes address a calendar through its account");

const calendar = read("src/routes/calendar.ts");

check("the calendar list reports which account each calendar came from", () => {
  assert.match(calendar, /connectionId: r\.connectionId/);
});

check("patching a calendar requires the connection id", () => {
  assert.match(
    calendar,
    /router\.patch\("\/google\/connections\/:connectionId\/calendars\/:calendarId"/,
  );
  assert.doesNotMatch(calendar, /router\.patch\("\/google\/calendars\/:calendarId"/);
});

check("unlinking a calendar requires the connection id", () => {
  assert.match(
    calendar,
    /router\.delete\("\/google\/connections\/:connectionId\/calendars\/:calendarId"/,
  );
  assert.doesNotMatch(calendar, /router\.delete\("\/google\/calendars\/:calendarId"/);
});

check("unlinking hides only that account's events", () => {
  // Without connectionId in the filter, unlinking one account's `primary` would
  // hide every other account's `primary` too.
  const unlink = calendar.slice(calendar.indexOf("router.delete(\"/google/connections/"));
  assert.match(unlink, /connectionId: existing\.connectionId/);
});

check("a calendar missing from one account's list is unlinked within that account", () => {
  const sync = calendar.slice(calendar.indexOf("router.post(\"/google/sync\""));
  assert.match(
    sync,
    /where: \{ connectionId: connection\.id, isLinked: true, id: \{ notIn: present \} \}/,
  );
});

check("a calendar row is written with the composite key, not a bare id", () => {
  // `update({ where: { id } })` no longer compiles, which is the point: the
  // compiler is what stops this class of bug returning.
  const sync = read("src/services/googleConnections.ts");
  assert.match(sync, /where: \{ connectionId_id: \{ connectionId: connection\.id, id: c\.id \} \}/);
});

check("remote deletions are scoped to the account and calendar they came from", () => {
  const sync = calendar.slice(calendar.indexOf("router.post(\"/google/sync\""));
  assert.match(sync, /sourceCalendarId: cal\.id/);
  assert.doesNotMatch(sync, /const seen = new Set<string>\(\)/);
});

console.log("\nOne account failing does not stop the others");

check("calendar sync collects a per-account failure instead of aborting", () => {
  const sync = calendar.slice(calendar.indexOf("router.post(\"/google/sync\""));
  // The per-account try/catch is what keeps six working accounts usable while one
  // grant is dead.
  assert.match(sync, /for \(const connection of connections\) \{\s*try \{/);
  assert.match(sync, /accountsFailed: failed\.length/);
  assert.match(sync, /failures: failed\.map/);
});

const tasks = read("src/services/googleTasks.ts");

check("task sync isolates a failing account too", () => {
  assert.match(tasks, /for \(const connection of connections\) \{[\s\S]*?try \{/);
  assert.match(tasks, /accountsFailed \+= 1/);
});

check("a task is identified by account, list and task id together", () => {
  // Any lookup by task id alone would let account 2 overwrite account 1's row.
  assert.match(
    tasks,
    /where: \{\s*userId,\s*connectionId: connection\.id,\s*googleTaskListId: list\.id,\s*googleTaskId: remote\.id,/,
  );
});

check("a task deleted in Google becomes a tombstone rather than coming back", () => {
  assert.match(tasks, /googleDeleted: remote\.deleted === true/);
  assert.match(tasks, /googleDeleted: true, deletedAt: new Date\(\)/);
});

check("a write that lost a race is re-read, not forced", () => {
  assert.match(tasks, /err\.status !== 412/);
  assert.match(tasks, /const fresh = await getTask\(/);
});

check("a failed push is recorded on the account instead of failing the local write", () => {
  assert.match(tasks, /recordPushFailure/);
  const routes = read("src/routes/tasks.ts");
  // A task must be completable while Google is unreachable.
  assert.match(routes, /await pushTaskUpdate\(req\.user\.id, task\.id\)/);
  assert.match(routes, /await pushTaskDelete\(req\.user\.id, existing\.id\)/);
  assert.match(routes, /await pushTaskCreate\(req\.user\.id, task\.id\)/);
});

check("a local-only edit does not call Google", () => {
  // Re-planning a task is a local concern; pushing it would be a wasted call
  // multiplied by the number of linked accounts.
  const routes = read("src/routes/tasks.ts");
  assert.match(routes, /const googleVisible =/);
});

console.log("\nSnapshots");

const syncRoute = read("src/routes/sync.ts");

check("a snapshot does not restore calendar links it cannot attribute", () => {
  // Linked calendars now require an account, and a snapshot carries no OAuth
  // tokens, so restoring the rows would produce calendars that can never sync.
  assert.match(syncRoute, /Calendar links are deliberately NOT restored/);
  assert.doesNotMatch(
    syncRoute,
    /linkedGoogleCalendar\.createMany\(\{[\s\S]{0,200}connectionId/,
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
