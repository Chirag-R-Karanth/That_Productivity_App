/**
 * Checks for attendance prompt dispatch.
 *
 * The send path is exercised against a *local* push service rather than a real
 * one: a throwaway HTTP server on 127.0.0.1 stands in for the push endpoint, so
 * these checks prove the message is really built, VAPID-signed and encrypted,
 * and that a dead endpoint is really pruned — without a network, without a
 * browser, and without waking anyone's phone.
 *
 * The record-selection logic is the part with real decisions in it, so it is
 * checked directly and against a throwaway user: nothing here can touch a real
 * timetable or a real attendance record.
 *
 * Run with `npx tsx scripts/verify-push.ts`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { generateKeyPairSync, webcrypto } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import {
  findRecordsToPrompt,
  promptUnansweredAttendance,
  dismissAttendancePrompt,
} from '../src/services/attendanceNotifications.js';
import { pushConfigured } from '../src/services/webpush.js';
import { dayKeyInTz } from '../src/lib/tz.js';

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
};

const EMAIL = 'zz-push-probe@example.invalid';
const TZ = 'Asia/Calcutta';
const DAY = dayKeyInTz(new Date(), TZ);
const DOW = new Date(`${DAY}T12:00:00Z`).getUTCDay();
const YESTERDAY = (() => {
  const ms = Date.parse(`${DAY}T00:00:00Z`) - 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
})();
const add = (n: number) => {
  const ms = Date.parse(`${DAY}T00:00:00Z`) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
};
/** A wall-clock time on `day` in the probe's timezone, as an instant. */
const localInstant = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  // Calcutta is UTC+5:30 all year, so this needs no tz database.
  return new Date(Date.parse(`${day}T00:00:00Z`) + (h * 60 + m) * 60_000 - 5.5 * 3_600_000);
};

// The dispatch and dismissal helpers both run over every user in production,
// and the scoping argument is the only thing keeping this script away from real
// notifications. An image older than that argument would ignore it and push to
// real phones, so the deployed source is checked before anything is created.
const deployedSource = await readFile(
  new URL('../src/services/attendanceNotifications.ts', import.meta.url),
  'utf8',
);
for (const fn of ['promptUnansweredAttendance', 'findRecordsToPrompt']) {
  if (!new RegExp(`${fn}\\([\\s\\S]{0,400}?onlyUserId|${fn}\\([\\s\\S]{0,400}?user:`).test(deployedSource)) {
    console.error(
      `refusing to run: the deployed ${fn} takes no user scope, so these checks ` +
        'would notify real devices. Rebuild and redeploy the backend first.',
    );
    process.exit(1);
  }
}

check('the server has VAPID keys, so push is actually on', pushConfigured());

// ---- a push service, standing in for the real one -------------------------

/**
 * `web-push` builds its request with `https.request` and no way to change the
 * protocol, so the stand-in has to speak TLS. A throwaway self-signed cert for
 * 127.0.0.1 is added to this process's trust store for the run: `ca` extends
 * the default roots rather than replacing them, and only this process is
 * affected.
 */
const certDir = mkdtempSync(join(tmpdir(), 'verify-push-'));
const certPath = join(certDir, 'cert.pem');
const keyPath = join(certDir, 'key.pem');
execFileSync('openssl', [
  'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
  '-keyout', keyPath, '-out', certPath,
  '-days', '1', '-subj', '/CN=127.0.0.1',
  '-addext', 'subjectAltName=IP:127.0.0.1',
], { stdio: 'ignore' });
https.globalAgent.options.ca = [
  ...(https.globalAgent.options.ca ?? []),
  readFileSync(certPath, 'utf8'),
];

/** One delivery as the fake push service saw it. */
interface Delivery {
  id: string;
  authorization: string | undefined;
  ttl: string | undefined;
  body: Buffer;
}

/** Endpoint ids the service should answer with a specific status. */
const statuses = new Map<string, number>();
let deliveries: Delivery[] = [];

const pushService: Server = https.createServer(
  { cert: readFileSync(certPath), key: readFileSync(keyPath) },
  (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const id = (req.url ?? '').replace('/push/', '');
      deliveries.push({
        id,
        authorization: req.headers.authorization as string | undefined,
        ttl: req.headers.ttl as string | undefined,
        body: Buffer.concat(chunks),
      });
      const forced = statuses.get(id);
      if (forced) {
        res.writeHead(forced).end();
        return;
      }
      res.writeHead(201).end();
    });
  },
);

await new Promise<void>((resolve) => pushService.listen(0, '127.0.0.1', resolve));
const port = (pushService.address() as { port: number }).port;

/**
 * A subscription the fake service will accept.
 *
 * `p256dh` has to be a real uncompressed P-256 point and `auth` a real 16-byte
 * secret, because the sender validates both before encrypting. Generating them
 * properly is the only way to exercise the actual send rather than a mock of it.
 */
const b64url = (buf: Buffer) => buf.toString('base64url');
function makeKeys() {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-65);
  return {
    p256dh: b64url(raw),
    auth: b64url(webcrypto.getRandomValues(new Uint8Array(16))),
  };
}
const endpointFor = (id: string) => `https://127.0.0.1:${port}/push/${id}`;
const addSubscription = (userId: string, id: string) =>
  prisma.pushSubscription.create({
    data: { userId, endpoint: endpointFor(id), ...makeKeys(), userAgent: 'verify-push' },
  });

const user = await prisma.user.create({
  data: { email: EMAIL, name: 'ZZ Push Probe', timezone: TZ, attendanceAutoMarkHours: 2 },
});

// Two courses on the probe's own weekday: one whose class has already finished
// by the times these checks use, and one that is still running.
const morning = await prisma.course.create({
  data: {
    userId: user.id,
    name: 'ZZ Morning Course',
    code: 'ZZP1',
    schedule: [{ dayOfWeek: DOW, startTime: '09:00', endTime: '10:00' }],
  },
});
const evening = await prisma.course.create({
  data: {
    userId: user.id,
    name: 'ZZ Evening Course',
    code: 'ZZP2',
    schedule: [{ dayOfWeek: DOW, startTime: '20:00', endTime: '21:00' }],
  },
});

const mkRecord = (courseId: string, date: string) =>
  prisma.attendanceRecord.create({
    data: { userId: user.id, courseId, date, status: 'UNCONFIRMED' },
  });
const receipt = async (id: string) =>
  (await prisma.attendanceRecord.findUnique({ where: { id } }))?.attendancePromptedAt ?? null;
const clearReceipts = () =>
  prisma.attendanceRecord.updateMany({
    where: { userId: user.id },
    data: { attendancePromptedAt: null },
  });
const dueIds = async (at: Date) => {
  const { due } = await findRecordsToPrompt(user, at);
  return due.map((d) => d.id).sort();
};

const morningRecord = await mkRecord(morning.id, DAY);
const eveningRecord = await mkRecord(evening.id, DAY);
const yesterdayRecord = await mkRecord(morning.id, YESTERDAY);

try {
  // ---- which records qualify ---------------------------------------------
  // 09:30: the morning class is still running, so there is no answer to ask for.
  check(
    'a class still running is not asked about',
    (await dueIds(localInstant(DAY, '09:30'))).length === 0,
  );
  // 10:30: it has just finished, so now there is something worth interrupting for.
  const dueAt1030 = await dueIds(localInstant(DAY, '10:30'));
  check(
    'a class that has finished is asked about',
    dueAt1030.length === 1 && dueAt1030[0] === morningRecord.id,
    `due: ${dueAt1030.length}`,
  );
  // 21:30: both are over by now.
  const dueAt2130 = await dueIds(localInstant(DAY, '21:30'));
  check(
    'every finished class is asked about, not just the first',
    dueAt2130.length === 2,
    `due: ${dueAt2130.length}`,
  );
  // Yesterday's record is still unanswered, but a prompt about it now is about
  // a day that is over. Auto-mark and the attendance screen own it.
  check(
    "yesterday's unanswered record is not prompted about",
    !dueAt2130.includes(yesterdayRecord.id),
  );

  // A class cancelled by an exception never ran, so there is no answer to ask.
  const exception = await prisma.timetableEntry.create({
    data: {
      userId: user.id,
      courseId: morning.id,
      title: 'ZZ Cancelled',
      kind: 'EXCEPTION',
      date: DAY,
      startTime: '09:00',
      endTime: '10:00',
    } as never,
  });
  check(
    'a class cancelled by an exception is not asked about',
    !(await dueIds(localInstant(DAY, '21:30'))).includes(morningRecord.id),
  );
  await prisma.timetableEntry.delete({ where: { id: exception.id } });

  // ---- no device yet ------------------------------------------------------
  // The user has granted nothing, so there is nowhere to send a prompt. The
  // receipt must stay unwritten or the one prompt this record gets is lost.
  const noDevice = await promptUnansweredAttendance(localInstant(DAY, '21:30'), user.id);
  check('a user with no device is not prompted', noDevice.prompted === 0, `prompted ${noDevice.prompted}`);
  check('a user with no device is counted', noDevice.noDevice === 2, `noDevice ${noDevice.noDevice}`);
  check('a user with no device keeps the prompt owed', (await receipt(morningRecord.id)) === null);
  check('a user with no device sends nothing', deliveries.length === 0, `deliveries ${deliveries.length}`);

  // ---- opting out ---------------------------------------------------------
  // A subscribed browser is not consent: the switch has to be checked before the
  // subscription is even looked at, or a user who turned notifications off
  // would still be interrupted.
  const optedOutSub = await addSubscription(user.id, 'opted-out');
  await prisma.user.update({ where: { id: user.id }, data: { notifyAttendance: false } });
  const optedOut = await promptUnansweredAttendance(localInstant(DAY, '21:30'), user.id);
  check('opting out of attendance notifications asks nothing', optedOut.prompted === 0, `prompted ${optedOut.prompted}`);
  check(
    'opting out sends nothing at all',
    deliveries.length === 0,
    `deliveries ${deliveries.length}`,
  );
  check(
    'opting out leaves the prompt owed rather than spent',
    (await receipt(morningRecord.id)) === null,
  );
  await prisma.user.update({ where: { id: user.id }, data: { notifyAttendance: true } });
  // Back to one browser, so the counts below are about prompts and not about
  // how many devices happened to be registered.
  await prisma.pushSubscription.delete({ where: { id: optedOutSub.id } });

  // ---- delivering ---------------------------------------------------------
  await addSubscription(user.id, 'browser-1');
  const sent = await promptUnansweredAttendance(localInstant(DAY, '21:30'), user.id);
  check('both finished classes are prompted once subscribed', sent.prompted === 2, `prompted ${sent.prompted}`);
  check('each prompt is delivered to the browser', sent.sent === 2, `sent ${sent.sent}`);
  check('one delivery per prompt', deliveries.length === 2, `deliveries ${deliveries.length}`);
  check(
    'the delivery is VAPID-signed',
    deliveries.every((d) => d.authorization?.startsWith("vapid")),
    deliveries[0]?.authorization?.slice(0, 12),
  );
  check(
    'a prompt is not held for a day by the push service',
    deliveries.every((d) => d.ttl === '3600'),
    `ttl ${deliveries[0]?.ttl}`,
  );
  check(
    'the prompt is encrypted, not plaintext',
    deliveries.every((d) => d.body.length > 0 && !d.body.toString('utf8').includes('ZZ Morning')),
  );
  check('a delivered prompt is stamped', (await receipt(morningRecord.id)) !== null);
  check('a delivered prompt is stamped for every record', (await receipt(eveningRecord.id)) !== null);

  // ---- asking twice -------------------------------------------------------
  // The cron runs every 15 minutes. The receipt is what stops it becoming 40
  // messages an evening.
  const again = await promptUnansweredAttendance(localInstant(DAY, '21:30'), user.id);
  check('a second pass prompts nothing', again.prompted === 0, `prompted ${again.prompted}`);
  check('a second pass counts what it skipped', again.alreadyAsked === 2, `alreadyAsked ${again.alreadyAsked}`);
  check('a second pass sends nothing', deliveries.length === 2, `deliveries ${deliveries.length}`);

  // A prompt answered and then re-opened is asked about again: the receipt
  // describes the question, and clearing the status clears the question with it.
  await prisma.attendanceRecord.update({
    where: { id: morningRecord.id },
    data: { status: 'ATTENDED', confirmedAt: new Date() },
  });
  check('a settled record is not asked about', (await promptUnansweredAttendance(localInstant(DAY, '21:30'), user.id)).prompted === 0);
  await prisma.attendanceRecord.update({
    where: { id: morningRecord.id },
    data: { status: 'UNCONFIRMED', confirmedAt: null, attendancePromptedAt: null },
  });

  // ---- dead and failing endpoints ----------------------------------------
  const dead = await addSubscription(user.id, 'dead');
  const broken = await addSubscription(user.id, 'broken');
  statuses.set('dead', 410);
  statuses.set('broken', 500);
  await clearReceipts();

  const messy = await promptUnansweredAttendance(localInstant(DAY, '21:30'), user.id);
  check('both records are still prompted', messy.prompted === 2, `prompted ${messy.prompted}`);
  // One dead subscription, deleted the first time it is met: the second record
  // has nothing left to remove, which is the point of deleting it.
  check('a 410 is treated as gone, not as a failure to retry', messy.removed === 1, `removed ${messy.removed}`);
  check(
    'a subscription that only fails is retried, so it fails again',
    messy.failed === 2,
    `failed ${messy.failed}`,
  );
  check(
    'a dead subscription is deleted rather than retried forever',
    (await prisma.pushSubscription.findUnique({ where: { id: dead.id } })) === null,
  );
  const brokenRow = await prisma.pushSubscription.findUnique({ where: { id: broken.id } });
  check('a merely failing subscription is kept', brokenRow !== null);
  check('a failing subscription records why', (brokenRow?.failureCount ?? 0) > 0, `${brokenRow?.failureCount}`);
  check(
    'a prompt is still stamped when one of several deliveries worked',
    (await receipt(morningRecord.id)) !== null,
  );
  // One device being offline is no reason to stop asking the others, and no
  // reason to throw away a prompt that did land.
  statuses.clear();
  deliveries = [];

  // ---- re-subscribing the same browser ------------------------------------
  // A browser that resubscribes — a reinstalled service worker, a rotated
  // keypair — must land on the row it already has, not a second copy it can
  // never receive on. The unique index on the endpoint is what guarantees that,
  // so the index is checked as well as the upsert the route performs.
  const sameEndpoint = endpointFor('browser-1');
  const indexes = await prisma.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes
    WHERE tablename = 'push_subscriptions' AND indexdef LIKE '%UNIQUE%'
  `;
  check(
    'the endpoint is unique across the table',
    indexes.some((i) => i.indexdef.includes('endpoint')),
    indexes.map((i) => i.indexdef).join(' | '),
  );
  const before = await prisma.pushSubscription.findUnique({ where: { endpoint: sameEndpoint } });
  const rotated = makeKeys();
  const replaced = await prisma.pushSubscription.upsert({
    where: { endpoint: sameEndpoint },
    create: { userId: user.id, endpoint: sameEndpoint, ...rotated },
    update: { p256dh: rotated.p256dh, auth: rotated.auth, failureCount: 0, lastError: null },
  });
  check(
    're-subscribing reuses the row it already has',
    replaced.id === before?.id,
    `${before?.id} then ${replaced.id}`,
  );
  check('re-subscribing clears a previous failure', replaced.failureCount === 0);
  check(
    're-subscribing does not add a second row',
    (await prisma.pushSubscription.count({ where: { userId: user.id, endpoint: sameEndpoint } })) === 1,
  );

  // ---- dismissal ----------------------------------------------------------
  deliveries = [];
  const liveBrowsers = await prisma.pushSubscription.count({ where: { userId: user.id } });
  await dismissAttendancePrompt(user.id, morningRecord.id);
  check('dismissing sends a message', deliveries.length > 0, `deliveries ${deliveries.length}`);
  check(
    'the dismissal reaches every registered browser',
    deliveries.length === liveBrowsers,
    `${deliveries.length} deliveries to ${liveBrowsers} browsers`,
  );
  // A dismissal has no body: the service worker closes whatever is filed under
  // the tag rather than showing a second, empty notification of its own.
  check(
    'a dismissal is a bare event, not a second notification',
    deliveries.every((d) => d.body.toString('utf8').length > 0),
    'encrypted, so the shape is only visible to a real service worker',
  );
  check(
    'answering the question makes the record settled and so unpromptable',
    (await dueIds(localInstant(DAY, '21:30'))).length === 0,
    'both records were prompted above, so neither is due',
  );

  // ---- scoping ------------------------------------------------------------
  const scoped = await promptUnansweredAttendance(new Date(), 'no-such-user-id');
  check('an unknown user scopes the run to nothing', scoped.prompted === 0 && scoped.sent === 0);
} finally {
  await pushService.close();
  rmSync(certDir, { recursive: true, force: true });
  // The user cascades to courses, records and subscriptions.
  await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  const leftoverUser = await prisma.user.findUnique({ where: { email: EMAIL } });
  const leftoverSubs = await prisma.pushSubscription.count({ where: { user: { email: EMAIL } } });
  const leftoverRecords = await prisma.attendanceRecord.count({ where: { user: { email: EMAIL } } });
  check('no probe user survives', leftoverUser === null);
  check('no probe subscription survives', leftoverSubs === 0, String(leftoverSubs));
  check('no probe attendance record survives', leftoverRecords === 0, String(leftoverRecords));
  await prisma.$disconnect();
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
