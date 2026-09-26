/**
 * Checks the presentation-layer calendar dedup rules.
 *
 * The interesting cases are the ones where being wrong is expensive: a missed
 * merge double-counts a meeting and invents free time that does not exist, and
 * an over-eager merge deletes something the user actually meant to keep.
 */
import { dedupeEvents, duplicateGroups, type DedupableEvent } from "../src/services/calendarDedup.js";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const at = (h: number, m = 0) => {
  const d = new Date(Date.UTC(2026, 8, 26, h, m));
  return d;
};

let seq = 0;
function ev(partial: Partial<DedupableEvent> & { title: string }): DedupableEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    startTime: at(10),
    endTime: at(11),
    allDay: false,
    source: "GOOGLE",
    googleEventId: `g${seq}`,
    sourceCalendarId: "cal1",
    ...partial,
  };
}

console.log("— nothing to fold —");
{
  const events = [ev({ title: "Standup" }), ev({ title: "Design review", startTime: at(14) })];
  const { canonical, duplicates } = dedupeEvents(events);
  check("distinct events both survive", canonical.length === 2 && duplicates.length === 0);
  check("input order is preserved", canonical[0].title === "Standup");
}

console.log("\n— same title and time across calendars —");
{
  const a = ev({ id: "a", title: "Standup", sourceCalendarId: "cal1" });
  const b = ev({ id: "b", title: "Standup", sourceCalendarId: "cal2" });
  const { canonical, duplicates } = dedupeEvents([a, b]);
  check("two calendars collapse to one", canonical.length === 1 && duplicates.length === 1);
  check("the folded copy is not the one shown", canonical[0].id === "a");
}

console.log("\n— title variations that should still match —");
{
  const cases: [string, string][] = [
    ["Design Review", "design review"],
    ["Design  Review", "Design Review"],
    ["Design Review (Room 4)", "Design review"],
    ["DESIGN-REVIEW", "Design Review"],
  ];
  for (const [x, y] of cases) {
    const { canonical } = dedupeEvents([
      ev({ id: "x", title: x, startTime: at(10) }),
      ev({ id: "y", title: y, startTime: at(10) }),
    ]);
    check(`"${x}" ~ "${y}"`, canonical.length === 1);
  }
}

console.log("\n— variations that must NOT match —");
{
  const { canonical } = dedupeEvents([
    ev({ id: "x", title: "Design Review", startTime: at(10) }),
    ev({ id: "y", title: "Design Review", startTime: at(15) }),
  ]);
  check("same title, different time", canonical.length === 2);
}
{
  const { canonical } = dedupeEvents([
    ev({ id: "x", title: "Design Review", startTime: at(10) }),
    ev({ id: "y", title: "Design Retrospective", startTime: at(10) }),
  ]);
  check("same time, different title", canonical.length === 2);
}
{
  const { canonical } = dedupeEvents([
    ev({ id: "x", title: "Holiday", startTime: at(0), endTime: at(23, 59), allDay: true }),
    ev({ id: "y", title: "Holiday", startTime: at(10), endTime: at(11), allDay: false }),
  ]);
  check("all-day and timed with the same title", canonical.length === 2);
}
{
  const { canonical } = dedupeEvents([
    ev({ id: "x", title: "Lecture (Group A)", startTime: at(10) }),
    ev({ id: "y", title: "Lecture (Group B)", startTime: at(10) }),
  ]);
  check("two different qualifiers are a real difference", canonical.length === 2);
}
{
  const { canonical } = dedupeEvents([
    ev({ id: "x", title: "Lecture (Group A)", startTime: at(10) }),
    ev({ id: "y", title: "Lecture (Group A)", startTime: at(10) }),
  ]);
  check("an identical qualifier still merges", canonical.length === 1);
}
{
  const { canonical } = dedupeEvents([
    ev({ id: "x", title: "Design Review [Room 4]", startTime: at(10) }),
    ev({ id: "y", title: "Design Review", startTime: at(10) }),
  ]);
  check("a bracketed decoration is ignored too", canonical.length === 1);
}
{
  const { canonical } = dedupeEvents([
    ev({ id: "x", title: "   ", startTime: at(10) }),
    ev({ id: "y", title: "", startTime: at(10) }),
  ]);
  check("two untitled events are not assumed identical", canonical.length === 2);
}

console.log("\n— clock drift between calendars —");
{
  const { canonical } = dedupeEvents([
    ev({ id: "x", title: "Sync", startTime: at(10) }),
    ev({ id: "y", title: "Sync", startTime: at(10, 3) }),
  ]);
  check("3 minutes apart still merges", canonical.length === 1);
}
{
  const { canonical } = dedupeEvents([
    ev({ id: "x", title: "Sync", startTime: at(10) }),
    ev({ id: "y", title: "Sync", startTime: at(10, 30) }),
  ]);
  check("30 minutes apart does not merge", canonical.length === 2);
}

console.log("\n— a local copy wins over a synced one —");
{
  const local = ev({ id: "local", title: "1:1", source: "LOCAL", googleEventId: null, sourceCalendarId: null });
  const google = ev({ id: "gcal", title: "1:1" });
  const { canonical } = dedupeEvents([google, local]);
  check("the local event is the one shown", canonical.length === 1 && canonical[0].id === "local");
}

console.log("\n— transitive groups —");
{
  // A~B on time, B~C on title, A and C differ in punctuation.
  const { canonical, duplicates } = dedupeEvents([
    ev({ id: "a", title: "Weekly Review", startTime: at(9) }),
    ev({ id: "b", title: "Weekly Review", startTime: at(9, 2) }),
    ev({ id: "c", title: "weekly  review", startTime: at(9, 4) }),
  ]);
  check("a chain of near-matches is one event", canonical.length === 1 && duplicates.length === 2);
}

console.log("\n— provenance is preserved, never rewritten —");
{
  const a = ev({ id: "a", title: "Sync", sourceCalendarId: "cal1", googleEventId: "g1" });
  const b = ev({ id: "b", title: "Sync", sourceCalendarId: "cal2", googleEventId: "g2" });
  const { canonical, duplicates } = dedupeEvents([a, b]);
  const kept = canonical[0];
  const folded = duplicates[0];
  check("kept event keeps its own source calendar", kept.sourceCalendarId === "cal1");
  check("kept event keeps its own google id", kept.googleEventId === "g1");
  check("the folded copy is still addressable", folded.googleEventId === "g2" && folded.sourceCalendarId === "cal2");
}

console.log("\n— grouping for the UI —");
{
  const a = ev({ id: "a", title: "Sync", sourceCalendarId: "cal1" });
  const b = ev({ id: "b", title: "Sync", sourceCalendarId: "cal2" });
  const c = ev({ id: "c", title: "Solo" });
  const groups = duplicateGroups([a, b, c]);
  check("the duplicate points at the canonical", groups.get("b")?.id === "a");
  check("a unique event has no group", groups.get("c") === undefined);
}

console.log("\n— stability —");
{
  const events = [
    ev({ id: "a", title: "A", startTime: at(9) }),
    ev({ id: "b", title: "A", startTime: at(9), sourceCalendarId: "cal2" }),
    ev({ id: "c", title: "B", startTime: at(11) }),
  ];
  const first = dedupeEvents(events).canonical;
  const shuffled = [events[2], events[0], events[1]];
  const second = dedupeEvents(shuffled).canonical;
  // The contract is that the caller's order is preserved, so the two lists are
  // expected to differ in order but not in which events survived.
  check(
    "the same input set always yields the same survivors",
    JSON.stringify(first.map((e) => e.id).sort()) === JSON.stringify(second.map((e) => e.id).sort()),
  );
  check(
    "shuffled input comes back in the caller's order",
    // b is folded into a, so the survivors are c then a, in the shuffled order.
    second.map((e) => e.id).join() === "c,a",
  );
}
{
  // Canonical choice must not depend on row order, or the timeline would flicker.
  const a = ev({ id: "a", title: "A", startTime: at(9), sourceCalendarId: "cal1" });
  const b = ev({ id: "b", title: "A", startTime: at(9), sourceCalendarId: "cal2" });
  const first = dedupeEvents([a, b]).canonical[0].id;
  const second = dedupeEvents([b, a]).canonical[0].id;
  check("canonical choice is order-independent", first === second);
}

console.log("\n— edge cases —");
{
  check("empty input", dedupeEvents([]).canonical.length === 0);
}
{
  const one = ev({ title: "Solo" });
  const { canonical, duplicates } = dedupeEvents([one]);
  check("a single event is untouched", canonical.length === 1 && canonical[0] === one && duplicates.length === 0);
}
{
  // A zero-length event must not swallow a real one at the same time.
  const { canonical } = dedupeEvents([
    ev({ id: "x", title: "Ping", startTime: at(10), endTime: at(10) }),
    ev({ id: "y", title: "Ping", startTime: at(10), endTime: at(11) }),
  ]);
  check("a zero-length event does not merge with a real one", canonical.length === 2);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
