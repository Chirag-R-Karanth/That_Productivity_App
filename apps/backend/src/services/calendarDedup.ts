/**
 * Presentation-layer calendar de-duplication.
 *
 * The same meeting routinely arrives more than once: it is on two linked Google
 * calendars, or it is a copy the user also made locally. Left alone, Today
 * counts it twice and the capacity model reserves the time twice, which is
 * exactly the kind of quiet lie this app is supposed to avoid.
 *
 * This runs when a view is built and never writes to the database. Source rows
 * keep their own `googleEventId`, `sourceCalendarId` and `source`, because
 * those are how the event is traced back and re-synced; folding is a
 * presentation decision and stays reversible. If the dedup rule is ever wrong,
 * the next sync simply re-derives it.
 */

/** Times closer together than this are treated as the same event. */
const TOLERANCE_MS = 5 * 60 * 1000;

export interface DedupableEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  source: string;
  googleEventId: string | null;
  sourceCalendarId: string | null;
}

export interface DedupResult<T> {
  /** One entry per distinct event, in the caller's original order. */
  canonical: T[];
  /** Entries folded into a canonical one, also in the caller's order. */
  duplicates: T[];
}

/**
 * Ranks which copy represents a group.
 *
 * A local event wins over a synced one: the user typed it in, so it is the one
 * they will recognise. Beyond that, the earlier start is the real event and a
 * later one is probably a recurring copy, and the id breaks remaining ties so
 * the result is stable across requests rather than depending on row order.
 */
function rank<T extends DedupableEvent>(event: T): number {
  return event.source === "LOCAL" ? 0 : 1;
}

function betterThan<T extends DedupableEvent>(a: T, b: T): boolean {
  const bySource = rank(a) - rank(b);
  if (bySource !== 0) return bySource < 0;
  const byStart = a.startTime.getTime() - b.startTime.getTime();
  if (byStart !== 0) return byStart < 0;
  return a.id < b.id;
}

/**
 * Two events are the same when the titles match once punctuation and spacing
 * are ignored and the times coincide.
 *
 * Titles are compared loosely on purpose. Calendar systems append things like
 * "(Room 4)" or rewrite the punctuation, and a missed match is far more
 * annoying than a slightly over-eager one. All-day and timed events never
 * merge, because a day-long "Holiday" and a 09:00 "Holiday" are different
 * facts.
 */
/**
 * A stable key for "the same meeting", for callers that need to compare events
 * outside this module — the Google sync marks its stored `isDedupedDuplicate`
 * flag with it.
 *
 * Times are compared exactly here, while `dedupeEvents` allows a five minute
 * slack. That is deliberate and not an oversight: the stored flag is a hint
 * about what a sync just saw, whereas `dedupeEvents` is the rule that decides
 * what a user is shown, and it stays the authority. Google copies of one meeting
 * carry identical times, so the exact key is right in practice.
 */
export function eventFingerprint(event: {
  title: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
}): string {
  const t = event.allDay ? "all" : "timed";
  return [
    t,
    normaliseTitle(event.title),
    event.startTime.getTime(),
    event.endTime.getTime(),
  ].join("|");
}

function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

interface TitleParts {
  /** The title with any trailing qualifier removed. */
  core: string;
  /** What was inside the trailing parentheses or brackets. */
  qualifier: string;
}

function titleParts(title: string): TitleParts {
  const match = title.trim().match(/^(.*?)\s*[(\[]\s*([^()[\]]+?)\s*[)\]]\s*$/);
  const core = match?.[1] ?? title;
  const qualifier = match?.[2] ?? "";
  return { core: normaliseTitle(core), qualifier: normaliseTitle(qualifier) };
}

/**
 * A qualifier added by one system ("Design Review (Room 4)") must not stop a
 * match, because it is decoration on the same meeting. But two *different*
 * qualifiers ("Lecture (Group A)" vs "Lecture (Group B)") are a real difference
 * and are left alone — guessing there would hide a genuine clash.
 */
function sameTitle(a: string, b: string): boolean {
  const pa = titleParts(a);
  const pb = titleParts(b);
  if (!pa.core || pa.core !== pb.core) return false;
  if (!pa.qualifier || !pb.qualifier) return true;
  return pa.qualifier === pb.qualifier;
}

function sameTime(a: DedupableEvent, b: DedupableEvent): boolean {
  if (a.allDay !== b.allDay) return false;
  return (
    Math.abs(a.startTime.getTime() - b.startTime.getTime()) <= TOLERANCE_MS &&
    Math.abs(a.endTime.getTime() - b.endTime.getTime()) <= TOLERANCE_MS
  );
}

function isSameEvent(a: DedupableEvent, b: DedupableEvent): boolean {
  if (a.id === b.id) return false;
  if (!sameTitle(a.title, b.title)) return false;
  return sameTime(a, b);
}

/**
 * Folds same-title/same-time events into one.
 *
 * Groups are transitive: if A matches B and B matches C then all three are one
 * event even if A and C differ slightly, which is the right outcome for a
 * series that was edited on one calendar only.
 */
export function dedupeEvents<T extends DedupableEvent>(events: T[]): DedupResult<T> {
  const groups: T[][] = [];

  for (const event of events) {
    const target = groups.find((group) => group.some((member) => isSameEvent(member, event)));
    if (target) target.push(event);
    else groups.push([event]);
  }

  const canonical: T[] = [];
  const duplicates: T[] = [];
  const canonicalById = new Map<string, T>();

  for (const group of groups) {
    let best = group[0];
    for (const candidate of group.slice(1)) {
      if (betterThan(candidate, best)) best = candidate;
    }
    canonicalById.set(best.id, best);
    for (const member of group) {
      if (member.id === best.id) canonical.push(member);
      else duplicates.push(member);
    }
  }

  // Restore the caller's ordering, which the views rely on for the timeline.
  const order = new Map(events.map((e, i) => [e.id, i]));
  canonical.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  duplicates.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { canonical, duplicates };
}

/**
 * The group each folded event was merged into, for callers that want to say
 * so in the UI ("also on Work calendar") without loading the whole set.
 */
export function duplicateGroups<T extends DedupableEvent>(events: T[]): Map<string, T> {
  const { canonical, duplicates } = dedupeEvents(events);
  const groups = new Map<string, T>();
  if (duplicates.length === 0) return groups;

  for (const duplicate of duplicates) {
    const match = canonical.find(
      (c) =>
        c.id !== duplicate.id &&
        sameTitle(c.title, duplicate.title) &&
        sameTime(c, duplicate),
    );
    if (match) groups.set(duplicate.id, match);
  }
  return groups;
}
