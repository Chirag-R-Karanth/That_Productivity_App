/**
 * Day arithmetic in the user's timezone.
 *
 * A planning app is only correct if "today" means today where the person is
 * sitting. The server may well be running in UTC — ours is — while the user is
 * five and a half hours ahead, which means that for a few hours after local
 * midnight the server would file the current morning under yesterday, hand back
 * the wrong capacity, and quietly put tasks reserved for "today" on the wrong
 * date.
 *
 * So every day boundary is resolved through an explicit IANA zone. The zone
 * comes from the user's record, refreshed from the browser when they are known
 * to be in a different one, and falls back to UTC only if genuinely unknown.
 *
 * `Intl.DateTimeFormat` is used rather than a date library: it is already
 * present in Node, it knows every zone the browser knows, and it keeps the two
 * sides of the app agreeing without shipping a second copy of the tz database.
 */

/** Fields describing an instant as it reads on a wall clock in `tz`. */
export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0 = Sunday
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(tz);
  if (cached) return cached;
  try {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
    formatterCache.set(tz, f);
    return f;
  } catch {
    // An unknown zone must not take the request down; fall back to UTC.
    return null;
  }
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  return formatterFor(tz) !== null;
}

/** Resolve an instant to the wall-clock reading in `tz`. */
export function zonedParts(at: Date, tz: string): ZonedParts {
  const f = formatterFor(tz);
  if (!f) return zonedParts(at, "UTC");

  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(at)) parts[p.type] = p.value;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl renders midnight as "24" in some locales/engines with hour12:false.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD for the instant `at`, as read in `tz`. */
export function dayKeyInTz(at: Date, tz: string): string {
  const p = zonedParts(at, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since local midnight for the instant `at`, as read in `tz`. */

export function minutesOfDayInTz(at: Date, tz: string): number {
  const p = zonedParts(at, tz);
  return p.hour * 60 + p.minute;
}

/** Day of week (0 = Sunday) for a YYYY-MM-DD key, in that day's own local terms. */
export function weekdayOfKey(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/**
 * The UTC instant of local midnight starting `date` in `tz`.
 *
 * Going through UTC and arithmetically subtracting the zone offset avoids the
 * classic `new Date("YYYY-MM-DD")` trap, where the string is read as UTC and
 * then rendered as local — which lands on the previous day west of Greenwich.
 */
export function dayStartUtc(date: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  // Offset = wall-clock reading - the same instant read as UTC.
  const offset = minutesOfDayInTz(new Date(asUtc), tz);
  return new Date(asUtc - offset * 60_000);
}

/** Exclusive end of `date` in `tz` — the instant local midnight of the next day. */
export function dayEndUtc(date: string, tz: string): Date {
  return dayStartUtc(addDaysTz(date, 1, tz), tz);
}

/**
 * Shift a YYYY-MM-DD key by whole days.
 *
 * Done on the calendar, not on an instant, so adding a day never skips or
 * repeats one across a daylight-saving transition.
 */
export function addDaysTz(date: string, days: number, _tz?: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Minutes from local midnight of `date` to the instant `at`, both in `tz`. */
export function minutesIntoDay(date: string, at: Date, tz: string): number {
  return Math.round((at.getTime() - dayStartUtc(date, tz).getTime()) / 60_000);
}
