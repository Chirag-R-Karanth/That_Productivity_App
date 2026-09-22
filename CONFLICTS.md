# Conflict resolution & data model

That Productivity App is offline-first: writes are applied locally, then
replayed against the server. Because a single device owns most data, conflicts
are rare — but the rules below make them deterministic and lossless whenever
they do happen.

## The three rules

1. **Native edits resolve last-write-wins.** Tasks, courses, attendance records,
   local calendar events, and focus sessions carry `updatedAt` (or `confirmedAt`
   for attendance). When two edits to the same row race, the one that landed on
   the server last wins. No merges, no silent loss of a newer version.

2. **Google data preserves its source identity.** Google Calendar events keep
   `googleEventId` and `sourceCalendarId`; deduped duplicates keep their own row
   flagged `isDedupedDuplicate`. Google events are **read-only** — the app never
   writes back to a linked calendar, so there is nothing to reconcile on that
   boundary. When a remote event disappears from a sync, its row is soft-deleted
   (`isDeleted = true`), never destroyed.

3. **Genuine conflicts surface, they don't get swallowed.** Any write that the
   server rejects after a replay lands in the `PendingSync` table with
   `status = FAILED` and an `error`. The Data & Sync page shows the pending /
   applied / failed counts so nothing fails silently. Nothing in this app is
   allowed to fail in a way that loses data.

## How idempotency makes replays safe

Every mutating request carries an `Idempotency-Key` (`crypto.randomUUID()` per
request). The backend records it in `PendingSync` (`PENDING` → `APPLIED`) and:

- rejects a duplicate `APPLIED` key with `200 { deduplicated: true }` instead of
  applying the write again — so a network response lost after commit, or a
  double-tap, can never double-apply;
- replays from the offline IndexedDB queue use the *original* key, so a queued
  write applied once is never applied twice.

## Tables involved

| Name | Role |
| --- | --- |
| `PendingSync` | Idempotency ledger + failed-write log (`PENDING`/`APPLIED`/`FAILED`). |
| `events` | Immutable, append-only analytics log — never updated or deleted. |
| `snapshots/` (server dir) | JSON snapshots: `backup-*` (created on demand), `pre-restore-*` (auto before every restore). |

## Restore is never blind

Restoring accepts only a validated snapshot (`app = "that-productivity-app"`,
`type = "data-export"`, current `version`). It:

1. validates the whole file before touching the database (collections, required
   fields, FK references such as task→course);
2. writes a `pre-restore-*` snapshot of the current state first;
3. replaces **only the signed-in user's** rows, inside a single transaction —
   any failure rolls everything back.

A restore can never touch another user's data, and can never run without a
pre-restore safety copy of the current state.