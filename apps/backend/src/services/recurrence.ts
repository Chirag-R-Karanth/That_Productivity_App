import { createRequire } from "node:module";
import type { RRule as RRuleClass, RRuleStrOptions } from "rrule";

// rrule's ESM wrapper is a CommonJS default interop quirk; type imports are
// erased at runtime, and `require` resolves the CJS build whose named exports exist.
const require = createRequire(import.meta.url);
const { RRule } = require("rrule") as { RRule: typeof RRuleClass };

function toDateTime(dateStr: string, timeStr?: string | null): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (timeStr) {
    const [hh, mm] = timeStr.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }
  return new Date(y, m - 1, d, 12, 0, 0);
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayYMD(): string {
  return toYMD(new Date());
}

function addDays(dateStr: string, n: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n, 12, 0, 0);
  return dt;
}

function yesterdayYMD(dateStr: string): string {
  return toYMD(addDays(dateStr, -1));
}

function parseRule(rule: string, dtstart: Date): RRuleClass | null {
  try {
    const parsed = RRule.parseString(rule) as Partial<RRuleStrOptions>;
    return new RRule({ ...parsed, dtstart });
  } catch {
    return null;
  }
}

/**
 * For a recurring task, compute the next pending occurrence date after
 * `lastCompletedOccurrence` (or today if none completed).
 * Returns null if the series was completed via the base `completed` flag
 * or no occurrences remain in a 365-day window.
 */
function nextOccurrenceDate(
  rule: string,
  dtstart: Date,
  lastCompleted: string | null,
): string | null {
  const rrule = parseRule(rule, dtstart);
  if (!rrule) return null;

  const afterDate = lastCompleted ? addDays(lastCompleted, 0) : addDays(todayYMD(), -1);
  const next = rrule.after(afterDate, false);
  if (!next) return null;
  return toYMD(next);
}

/**
 * Is there an occurrence on `targetDate` that hasn't been completed?
 * (i.e., targetDate > lastCompletedOccurrence and targetDate is an occurrence date)
 */
function isOccurrencePending(
  rule: string,
  dtstart: Date,
  lastCompleted: string | null,
  targetDate: string,
): boolean {
  const rrule = parseRule(rule, dtstart);
  if (!rrule) return false;

  const afterBase = lastCompleted ?? yesterdayYMD(todayYMD());
  const from = addDays(afterBase, 1);
  const to = addDays(targetDate, 1);
  const occurrences = rrule.between(from, to, true);
  return occurrences.some((d) => toYMD(d) === targetDate);
}

/**
 * For a recurring task, list occurrence dates (YYYY-MM-DD) in [from, to],
 * marking each as completed or pending based on lastCompletedOccurrence.
 * Completed = date <= lastCompletedOccurrence.
 */
interface OccurrenceResult {
  date: string;
  completed: boolean;
}

function getOccurrencesInWindow(
  rule: string,
  dtstart: Date,
  from: string,
  to: string,
  lastCompleted: string | null,
): OccurrenceResult[] {
  const rrule = parseRule(rule, dtstart);
  if (!rrule) return [];

  const fromDate = addDays(from, -1);
  const toDate = addDays(to, 1);
  const dates = rrule.between(fromDate, toDate, true);

  return dates.map((d) => {
    const ymd = toYMD(d);
    const completed =
      lastCompleted !== null ? ymd <= lastCompleted : false;
    return { date: ymd, completed };
  });
}

/**
 * Move lastCompletedOccurrence back to the previous occurrence before the
 * un-completed date (for linear un-complete semantics).
 */
function previousOccurrence(
  rule: string,
  dtstart: Date,
  uncompleteDate: string,
): string | null {
  const rrule = parseRule(rule, dtstart);
  if (!rrule) return null;

  const before = addDays(uncompleteDate, -1);
  const dates = rrule.between(addDays(todayYMD(), -365), before, true);
  if (dates.length === 0) return null;
  return toYMD(dates[dates.length - 1]);
}

export const recurrence = {
  toDateTime,
  toYMD,
  todayYMD,
  parseRule,
  nextOccurrenceDate,
  isOccurrencePending,
  getOccurrencesInWindow,
  previousOccurrence,
  addDays,
};
