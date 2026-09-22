# That_Productivity_App

A full-stack productivity suite — tasks, courses & attendance, calendar, and a
Pomodoro focus timer — shipped as a Progressive Web App (offline-first) plus an
Expo (React Native) companion app. Gamifies learning through streaks, focus
minutes, and attendance-risk tracking.

## Architecture

| Package              | What it is                                              |
| -------------------- | ------------------------------------------------------- |
| `apps/backend`       | Express 5 + Prisma 7 (PostgreSQL) REST API, JWT auth, attendance cron, Google Calendar + FCM scaffolds |
| `apps/web`           | Next.js PWA (`output: standalone`), Service Worker with offline queue + idempotent replay |
| `apps/mobile`        | Expo SDK 57 app (secure auth via SecureStore)           |
| `packages/shared-types` | Shared TypeScript types consumed by web + backend (as TS source) |

Data model: users, tasks (recurring), courses with timetable slots, attendance
records (tracked via cron), calendar events (LOCAL + GOOGLE), pomodoro sessions,
and a `PendingSync` table that backs the idempotency middleware.

## Offline / sync design

- Mutating requests carry an `Idempotency-Key` (`pendingSync` dedup on the API).
- When the browser is offline, writes are queued in IndexedDB (`prodapp-pending`)
  and optimistically reflected in the UI.
- On reconnect, the queue replays against the API with the original keys, so a
  lost-response retry can never double-apply. A `sync-refresh` event updates live
  views afterwards; the Service Worker also precaches the app shell and caches
  API reads for offline browsing.

## Local development

Requirements: Node ≥ 22, pnpm ≥ 11, Docker (for Postgres).

```bash
pnpm install
cp .env.example .env            # then set JWT_SECRET / DATABASE_URL / ports
docker compose up -d            # Postgres on :5434
pnpm --filter backend db:push   # or: pnpm db:migrate (dev migrations)
pnpm --filter backend dev:once  # API on :4000 (keep running)
pnpm --filter web dev           # web on :3000
pnpm --filter backend db:studio # optional Prisma Studio
pnpm build                      # typecheck + build every package
```

Apps are wired through `web` (browser → `NEXT_PUBLIC_API_URL` → API) and
`mobile` (Metro bundles `EXPO_PUBLIC_API_URL`, default `http://localhost:4000`).

## Backups (data safety)

The database is the source of truth for tasks, courses, **timetable slots**
(the `schedule` JSON on each course), attendance, calendar and focus data.
Never run `prisma migrate reset` or a destructive seed. Use the backup tooling
before any schema work:

```bash
pnpm backup          # pg_dump -> deploy/backups/productivity-<timestamp>.sql (+ row-count snapshot)
pnpm backup:verify   # checks the newest dump's integrity + diffs current row counts
pnpm backup:list     # list existing dumps
```

The database typically runs in the `productivity-db` Docker container; the
script prefers `docker exec` and falls back to host `pg_dump`/`psql` when the
container is absent. Connection settings come from `DATABASE_URL` in `.env`.

**Migration rules enforced across this repo:**

- Every schema change is additive with a migration path.
- The timetable slot contract `{ dayOfWeek, startTime, endTime }` is frozen;
  expansions use optional new fields and a separate date-based model.
- Before/after every migration: run `pnpm backup`, verify record counts, then
  re-run `pnpm backup:verify` after the change.

## Data & Sync and conflict rules

In-app, **Settings → Data & Sync** (and the `/data-sync` page) shows device and
server health, exports and restores your data as validated JSON snapshots, and
creates server-side snapshot backups. Restoring is never blind: the file is
validated first, a `pre-restore` snapshot of the current state is written, and
the replacement runs in one transaction against your user's data only.
See [CONFLICTS.md](./CONFLICTS.md) for the sync conflict-resolution rules and
the immutable event log, and [ROADMAP.md](./ROADMAP.md) for the phased redesign.

## Production (Docker self-host)

`docker-compose.prod.yml` brings up the whole stack behind an nginx reverse
proxy — Postgres, API (auto-runs `prisma migrate deploy` on boot), the Next.js
standalone PWA, and nginx serving them from **one origin**:

```bash
cp .env.example .env
# Required in .env: JWT_SECRET, WEB_APP_URL
#   WEB_APP_URL = the public origin your users will open, e.g. https://app.example.com
#   (DATABASE_URL is derived from DB_* for containers)
pnpm docker:prod:build
PRODAPP_PORT=8080 pnpm docker:prod:up   # default port 8080
```

- Web + API are served on `http://<host>:8080`; nginx proxies `/api/*` to the backend.
- The PWA is built with an empty `NEXT_PUBLIC_API_URL` on purpose (same-origin).
  Do **not** put a host-port URL in `.env` for the Docker deployment.
- `WEB_APP_URL` is used to redirect back after linking Google Calendar — it must
  be the origin of this deployment (no trailing slash).
- Postgres data persists in the `prodapp_pgdata` volume; `pnpm docker:prod:down`
  stops the stack without deleting it.

## Linking Google Calendar

The web app can import your Google Calendar (read-only) so events show up next
to tasks and classes:

1. Create OAuth credentials at https://console.cloud.google.com → APIs &
   Services → Credentials. Use an **OAuth client ID** of type *Web application*
   with Authorized redirect URI: `<your WEB_APP_URL>/api/auth/google/callback`.
2. Enable the *Google Calendar API* for the project.
3. Put the client ID and secret in the environment as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` (add to `.env` / the backend service in
   `docker-compose.prod.yml`).
4. Rebuild/restart, then sign in and go to **Settings → Google Calendar →
   Connect**. You'll be redirected to Google, then back to
   `/settings?google=linked`.

Only an OAuth *consent-screen* change is needed for testing as yourself, but any
internal/limited test users must be added to the project's audience. If the
credentials are missing, the Settings page shows "not configured" and the
connect button is hidden.

## Importing a timetable screenshot

On the **Timetable** page choose "Import from a screenshot". The OCR runs in
your browser (tesseract.js — nothing is uploaded), so a picture of a printed
timetable table becomes editable rows for day/time/name which you confirm before
they're saved. Multiple rows sharing a course name are collapsed into one course
with all its weekly slots — a Tuesday AND Wednesday slot of "Math 101" is one
course, not two.

## Using it on your phone

Two options:

**A. PWA (installable from the browser).** Open the web app on your phone (same
LAN or the deployed URL), then use the browser's **Add to Home screen** option.
It's offline-first and works without a backend connection once loaded.

**B. Expo app (`apps/mobile`).** The companion app for iOS/Android via Expo Go
or a dev build. Point it at your backend at bundle time:

```bash
# LAN: use your machine's IP so the phone can reach the API
EXPO_PUBLIC_API_URL=http://192.168.x.x:4000 pnpm --filter mobile start
EXPO_PUBLIC_API_URL=http://192.168.x.x:4000 pnpm --filter mobile android
EXPO_PUBLIC_API_URL=http://192.168.x.x:4000 pnpm --filter mobile ios
```

(pick the appropriate iOS/Android case from the `scripts` section of
`apps/mobile/package.json`). Calendar and Settings live in the bottom tab bar;
Google Calendar linking is done once from the web Settings page and shows up
automatically.

## Tests / verification

E2E scripts validate each API surface (calendar, pomodoro, attendance) and a
Playwright suite proves the offline flow: SW registration → offline write
queued → reconnect → exactly-once replay.

## Mobile builds

`apps/mobile` is an Expo app for Android/iOS. Define the API URL at bundle time:

```bash
EXPO_PUBLIC_API_URL=http://<your-host>:4000 pnpm --filter mobile start
```