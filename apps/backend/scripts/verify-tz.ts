/**
 * Day arithmetic must agree with the user's wall clock, not the server's.
 *
 * The failure this guards against is quiet and nasty: a server in UTC handing
 * someone in Asia/Kolkata yesterday's morning for the first hours of their day,
 * which then files tasks reserved for "today" under the wrong date.
 */
import {
  addDaysTz,
  dayEndUtc,
  dayKeyInTz,
  dayStartUtc,
  isValidTimezone,
  minutesIntoDay,
  minutesOfDayInTz,
  weekdayOfKey,
} from '../src/lib/tz.js';

let pass = 0;
let fail = 0;
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`PASS  ${name} — ${a}`);
  } else {
    fail++;
    console.log(`FAIL  ${name} — got ${a}, expected ${e}`);
  }
};

// ---- The exact failure: 00:21 IST on 26 Sep is 18:51 UTC on 25 Sep ---------
const lateNight = new Date('2026-09-25T18:51:00Z');
eq('Kolkata is already on the 26th at 18:51 UTC', dayKeyInTz(lateNight, 'Asia/Kolkata'), '2026-09-26');
eq('UTC is still on the 25th at the same instant', dayKeyInTz(lateNight, 'UTC'), '2026-09-25');
eq('the clock reads 00:21 in Kolkata', minutesOfDayInTz(lateNight, 'Asia/Kolkata'), 21);

// A handful of other zones, to prove this is not a one-offset special case.
eq('New York is still on the 25th at 18:51 UTC', dayKeyInTz(lateNight, 'America/New_York'), '2026-09-25');
eq('Tokyo is on the 26th at 18:51 UTC', dayKeyInTz(lateNight, 'Asia/Tokyo'), '2026-09-26');
eq('Sydney is on the 26th at 18:51 UTC', dayKeyInTz(lateNight, 'Australia/Sydney'), '2026-09-26');
eq('Honolulu is on the 25th at 18:51 UTC', dayKeyInTz(lateNight, 'Pacific/Honolulu'), '2026-09-25');

// ---- Day boundaries ---------------------------------------------------------
eq(
  'Kolkata 2026-09-26 starts at 18:30 UTC the day before',
  dayStartUtc('2026-09-26', 'Asia/Kolkata').toISOString(),
  '2026-09-25T18:30:00.000Z',
);
eq(
  'Kolkata 2026-09-26 ends exclusively at the next local midnight, 18:30 UTC',
  dayEndUtc('2026-09-26', 'Asia/Kolkata').toISOString(),
  '2026-09-26T18:30:00.000Z',
);
eq(
  'a UTC day starts at 00:00 UTC',
  dayStartUtc('2026-09-26', 'UTC').toISOString(),
  '2026-09-26T00:00:00.000Z',
);
// Berlin leaves DST on the last Sunday of October (25th in 2026), so that local
// day is 25 hours long when measured in UTC instants.
eq(
  'a Berlin day is 25h long on the day DST ends',
  dayEndUtc('2026-10-25', 'Europe/Berlin').getTime() - dayStartUtc('2026-10-25', 'Europe/Berlin').getTime(),
  25 * 60 * 60 * 1000,
);
eq(
  'and 23h on the day DST begins (last Sunday of March 2026)',
  dayEndUtc('2026-03-29', 'Europe/Berlin').getTime() - dayStartUtc('2026-03-29', 'Europe/Berlin').getTime(),
  23 * 60 * 60 * 1000,
);
eq(
  'an ordinary day is still 24h',
  dayEndUtc('2026-10-31', 'Europe/Berlin').getTime() - dayStartUtc('2026-10-31', 'Europe/Berlin').getTime(),
  24 * 60 * 60 * 1000,
);

// ---- Calendar shifting, which must never skip or repeat a day --------------
eq('adding days across a month end', addDaysTz('2026-09-30', 1), '2026-10-01');
eq('subtracting across a year end', addDaysTz('2027-01-01', -1), '2026-12-31');
eq('shifting across the DST boundary keeps the calendar', addDaysTz('2026-03-28', 2, 'Europe/Berlin'), '2026-03-30');
eq('a leap day survives arithmetic', addDaysTz('2024-02-28', 1), '2024-02-29');
eq('the day after a leap day', addDaysTz('2024-02-29', 1), '2024-03-01');

// ---- Weekdays ---------------------------------------------------------------
eq('2026-09-26 is a Saturday', weekdayOfKey('2026-09-26'), 6);
eq('2026-09-21 is a Monday', weekdayOfKey('2026-09-21'), 1);
eq('2026-09-20 is a Sunday', weekdayOfKey('2026-09-20'), 0);

// ---- Position within the day ------------------------------------------------
eq(
  '00:21 IST on the 26th is 21 minutes into the 26th',
  minutesIntoDay('2026-09-26', lateNight, 'Asia/Kolkata'),
  21,
);
eq(
  'the same instant is 1111 minutes into the 25th for a UTC user',
  minutesIntoDay('2026-09-25', lateNight, 'UTC'),
  18 * 60 + 51,
);

// ---- Bad input must not throw ----------------------------------------------
eq('an unknown zone is rejected', isValidTimezone('Mars/Olympus_Mons'), false);
eq('empty is rejected', isValidTimezone(''), false);
eq('null is rejected', isValidTimezone(null), false);
eq('a real zone is accepted', isValidTimezone('Asia/Kolkata'), true);
eq('an unknown zone still yields a usable answer', dayKeyInTz(lateNight, 'Mars/Olympus_Mons'), '2026-09-25');
eq('midnight is hour 0, not 24', minutesOfDayInTz(new Date('2026-09-26T00:00:00Z'), 'UTC'), 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
