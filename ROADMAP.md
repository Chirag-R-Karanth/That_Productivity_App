# That Productivity App — Redesign Roadmap

The full product redesign per the master brief. One section per phase; every deliverable is
a checklist item.

**Conventions**

- `- [x]` = done and verified.
- `- [ ]` = not done or only partially done. Any item that was attempted but is not finished
  carries a comment underneath explaining why, e.g.
  `<!-- not done: blocked on VAPID keys being provided in .env -->`.
- Phase status line: `pending` / `in-progress` / `done` / `partial`.

## Non-negotiable rules

1. Existing data is never destroyed — especially `Course.schedule` timetable data.
2. Every schema change is additive + has a migration path + is verified with before/after
   record counts.
3. The timetable slot contract `{ dayOfWeek, startTime, endTime }` is frozen. New kinds are
   additive fields; date-based one-offs get a new model.
4. No destructive seeds, no `prisma migrate reset`, no DB replacement.
5. Phone is a notification endpoint only. `apps/mobile` is not a product surface.

---

## Phase 0 — Data safety baseline (safety net first)

Status: `done`

- [x] Extract current timetable/data shape into a machine-readable snapshot (courses,
      `schedule` JSON, attendance records, task→course links).
      <!-- done: deploy/backups/audit-initial.json — 7 courses, timetable contract frozen -->
- [x] Add `pnpm backup` (timestamped pg_dump → `deploy/backups/`) and `pnpm backup:verify`
      (row-count diff) scripts.
      <!-- done: scripts/backup.mjs; verified end-to-end against the live DB -->
- [x] Document backup/restore in the README.
      <!-- done: "Backups (data safety)" section -->
- [x] Fix hardcoded attendance-history year (`apps/web/src/app/attendance/page.tsx`).
      <!-- done: web now relies on backend defaults; backend history defaults are a full range (2000-01-01..2100-12-31) -->
- [x] Fix UTC-vs-local calendar range serialization (`apps/web/src/app/calendar/page.tsx`).
      <!-- done: local-offset ISO serializer (localISO) used for range boundaries -->
- [x] Create `ROADMAP.md` with all phases/tasks.
      <!-- done: this file -->

## Phase 1 — Core architecture: events, sync status, backups

Status: `done`

- [x] Add immutable `Event` model (`event_id`, `userId`, `type`, `occurred_at`, `payload`)
      via additive migration.
      <!-- done: EventType enum + Event model (table "events": id, userId, type, occurredAt, payload, indexes on [userId,occurredAt] and [userId,type], FK cascade). Rows are append-only; never updated/deleted. Applied via 20260922072102_phase1_events (CREATE TYPE/TABLE/INDEX/FK only) + migrate deploy; status "up to date", existing row counts unchanged. Column names are camelCase per codebase convention. -->
- [x] Write events from the backend alongside real mutations: `task_created/completed/updated`,
      `focus_started/completed/cancelled`, `attendance_recorded`, `class_scheduled`,
      `calendar_event_synced`, `google_task_synced`.
      <!-- done: services/events.ts (best-effort, non-blocking) wired into tasks.ts (create/update/complete/delete), pomodoro.ts (start/end), attendance.ts (resolve), courses.ts (create/update), calendar.ts (create/update/google sync). GOOGLE_TASK_SYNCED is defined in the enum and will be written in Phase 5 when Google Tasks sync lands. Verified live: 5 events logged for course+task+event+focus round-trip. -->
- [x] Add sync-status strip (saved / offline-pending / saving / sync-issue) wired to the
      IndexedDB queue + `PendingSync` + SW events.
      <!-- done: lib/syncStatus.ts emitter + hooks/useSyncStatus.ts + SyncStatusStrip in AppShell. api.ts emits saving/saved/issue/pending; SW replay emits saved + sync-refresh; strip reads IndexedDB queue count, online flag, last-sync from localStorage, and links to /data-sync. Server PendingSync counts surface on the Data & Sync page. -->
- [x] Build the Data & Sync page: local health, last sync, pending count, Export all data (JSON),
      Create backup, Restore backup (validated, non-clobbering, pre-restore backup).
      <!-- done: apps/web/src/app/data-sync/page.tsx + routes/sync.ts (GET /health, GET /export JSON, POST /backup + GET /backups + GET /backup/file, POST /restore). Restore validates the whole snapshot before mutating, writes a pre-restore-* snapshot first, and replaces only the signed-in user's rows in one transaction. "Create backup" = server-side JSON snapshot (SQL-level pnpm backup remains the terminal tool). Round-trip verified live incl. validation rejections leaving data untouched. -->
- [x] Enforce deterministic conflict rules (last-write-wins for native edits, source-id
      preservation for Google data, surface genuine conflicts).
      <!-- done: documented in CONFLICTS.md + README; enforced via idempotency middleware (PendingSync PENDING/APPLIED/FAILED), updatedAt last-write-wins, googleEventId/sourceCalendarId preservation + isDedupedDuplicate, soft-delete never destroys. Failed sync rows surface as FAILED counts on the Data & Sync page. -->
- [x] Add Settings → Data & Sync section.
      <!-- done: replaces the old "This device" section — pending count, last sync, link to /data-sync, clear offline cache. -->

## Phase 2 — Desktop shell + design system

Status: `done`

- [x] Extend `globals.css` design tokens: light + dark + Zen palettes, one accent, semantic
      colors, consistent radii/spacing.
      <!-- done: token rewrite @theme inline → utilities resolve to runtime variables (--t-*); dark is unchanged, added .light and .zen palettes + accent-soft/backdrop/focus tokens; radii/spacing stay on the default scale. -->
- [x] Light/dark toggle persisted + applied; `reduced-motion` support.
      <!-- done: lib/theme.tsx ThemeProvider + ThemeToggle (localStorage, default = system preference), head pre-hydration script in layout (no flash), light/dark classes on <html>. Reduced-motion honored from the OS preference AND an explicit toggle (html.reduce-motion) in global CSS + lib/motion.ts short-circuits anime.js in Reveal/AnimatedNumber. -->
- [x] New sidebar: Search (Ctrl/Cmd+K) · WORK: Today/Tasks/Calendar · ACADEMICS:
      Courses/Attendance/Timetable · INSIGHTS: Analytics · Settings. Drop the mobile-only
      bottom nav (desktop-first).
      <!-- done: AppShell rebuilt — grouped nav (Work/Academics/Insights) + Focus/Settings footer, sticky full sidebar (lg), icon rail (md–lg), mobile drawer replaces the old bottom nav; auth pill moved into a UserMenu; brand = "That Productivity App". -->
- [x] Command palette: fuzzy search (tasks/courses/events) + actions (New task, Start focus,
      Enter Zen, open page).
      <!-- done: components/CommandPalette.tsx, hand-rolled subsequence matcher (lib/fuzzy.ts), fetches tasks/courses/upcoming events, groups + kind badges, arrow/enter navigation, Esc/click-out bubbles; actions navigate (N opens ?new=1, Start focus → /pomodoro; Zen arrives in Phase 4). -->
- [x] Keybindings: `Cmd/Ctrl+K`, `Z`, `Esc`, `N`, `T`, `C`, `A` (configurable later).
      <!-- done: lib/appKeys.tsx GlobalKeys — Ctrl/Cmd+K toggles palette, Esc closes it (also while typing), N→/tasks?new=1, T→/tasks, C→/calendar, A→/attendance, Z→/pomodoro (Zen in Phase 4); ignored while typing in inputs; listed in Settings → Keyboard. -->
- [x] Desktop notification bell (contextual inbox, not a nav section).
      <!-- done: NotificationBell fed by new backend GET /api/events (last 50 events with human summaries), unread badge persisted per device, "mark all read", links to Data & Sync. -->
- [x] Restructure Settings into Appearance / Notifications / Integrations / Data & Sync / Keyboard.
      <!-- done: settings/page.tsx tabbed; account block (name/sign out + display name save) sits above the tabs; Appearance (theme + motion), Notifications (chime, pomodoro, auto-mark + note that push arrives in Phase 7), Integrations (Google Calendar), Data & Sync (pending/last sync/open/clear), Keyboard (shortcut table); ?tab= deep-links work (palette "Back up & sync" action, bell footer). -->
- [x] Lightweight onboarding (name, timetable import optional; Google/notification steps appear
      once integrations exist).
      <!-- done: components/Onboarding.tsx — non-blocking card for users whose onboardingComplete=false; capture display name → PATCH /api/auth/me; skip persisted per device. backend /api/auth/me now returns onboardingComplete. -->

## Phase 3 — Today (hero redesign)

Status: `done`

- [x] Replace the KPI-grid home with the personal hero: avatar block, time-aware greeting,
      weekday/date, today's schedule (classes + events + free gaps), task line, focus CTA.
      <!-- done: apps/web/src/app/page.tsx rewritten. Hero = avatar monogram + "Good morning, <name>" + weekday/date + live clock; schedule card merges today's classes + non-all-day events into one timeline (kind badges, color dots, in-progress/up-next highlight with minutes-to-go, auto-detected free gaps ≥30min, all-day chips); Next task card with quick-complete ✓ and shortcuts; Day at a glance (attendable/awaiting/at-risk/focus); prominent Start focus CTA. -->
- [x] Subtle context shifts by time of day (morning / mid-day / evening / late).
      <!-- done: dayPhase() picks greeting + label per hour bucket; hero bg is a soft radial glow that shifts hue per phase (hero-morning/midday/evening/night classes in globals.css using theme-aware color-mix tints). -->
- [x] Keep the 60s auto-refresh and offline grace.
      <!-- done: 60s interval kept; loads are caught (no unhandled rejections), a "can't reach the server" notice surfaces, a 30s ticker keeps the clock/up-next counts fresh; last good state is preserved between ticks. -->

## Phase 3b — Capacity engine, adaptive planning, and the day model

Status: `done`

The original brief's centre of gravity: a day is not a list, it is a budget. This phase
adds the arithmetic that makes "you have planned more than the day holds" a fact the app
can state, and a day model that Today and Review both read from.

- [x] Additive schema for the capacity engine.
      <!-- done: migration 20260925183242_capacity_engine adds Task.plannedDate,
           Task.estimateMinutes, PomodoroSession.endedAt, PomodoroSession.actualMinutes,
           User.dayStartMinutes/dayEndMinutes/bufferMinutes, and a tasks(userId, plannedDate)
           index. All nullable, so existing rows are untouched. -->
- [x] One day model: merged timeline, capacity, and progress in a single response.
      <!-- done: services/dayModel.ts buildDayModel(). Merges timetable slots, local + Google
           events, focus sessions, planned work and deadlines into one ordered timeline;
           computes usable time as the awake window minus fixed commitments minus
           transition buffers, then planned/delta, and a verdict of open | light | tight |
           over. Today makes exactly one call, so the client never reconciles five
           endpoints and guesses whether they agree about what time it is. -->
- [x] Adaptive planning that names the consequence but never acts on it.
      <!-- done: services/dayModel.ts findDisplacements() reports what no longer fits and
           where it could go, ranked by how safe it is to move (no deadline first, then
           furthest deadline, then priority). Overdue work is reported as blocked rather
           than ranked movable. Nothing is ever rescheduled server-side — the user decides
           what slips. Verified: suggestions cover the whole overflow, nothing moves. -->
- [x] Expose the capacity window as first-class settings.
      <!-- done: GET /api/day, GET /api/day/:date/displacement, PATCH /api/day/capacity.
           These three numbers decide every verdict the app gives, so they are exposed
           directly instead of being buried in a generic settings form. -->
- [x] Let a task carry an estimate and a reserved day.
      <!-- done: POST/PATCH /api/tasks accept plannedDate and estimateMinutes; the tasks
           "today" filter now includes work reserved for today even without a deadline,
           since that reservation is exactly what the capacity math reads. The capture UI
           adds one tap for effort (15m/30m/1h/2h) and one for reserving today/tomorrow/
           a date, so capture stays fast. -->
- [x] Resolve "today" in the user's timezone, not the server's.
      <!-- done: migration 20260926003500_user_timezone adds User.timezone. All day
           boundaries resolve through an explicit IANA zone (src/lib/tz.ts), the browser
           reports its own zone on every request, and the reported zone is persisted for
           background work. This was a live bug, not a hypothetical: the server runs in UTC
           and the user is on IST, so between 00:00 and 05:30 local the app was serving
           yesterday's day and filing tasks reserved for "today" under the wrong date.
           Verified with 29 checks across Kolkata/Tokyo/New York/Sydney/Honolulu/Berlin,
           including 23h and 25h days on daylight-saving transitions. -->

## Phase 4 — Zen

Status: `done`

- [x] Zen mode: enter via `Z` / "Start focus", exit via `Esc`; full-screen near-black
      environment, UI surrendered, fade transition (anime.js).
      <!-- done: standalone /zen route — no AppShell chrome, body scroll locked, .zen palette applied to <html> while inside; enters via the Z key, sidebar Focus, dashboard CTA and palette ("Start focus"); exits on Esc with a confirm overlay if a focus session is open, soft fade via anime.js (skipped under reduce-motion). Old /pomodoro now redirects here. -->
- [x] Flip clock centerpiece (CSS 3D flip digits), huge legible type.
      <!-- done: components/FlipClock.tsx — per-digit tiles split into static halves + animated leaf halves that fold away (odometer flap) with CSS keyframes; tabular mono, clamp() sizes up to ~9.5rem; digits fade-swap under prefers-reduced-motion. -->
- [x] Variable pomodoro: focus / short rest / long rest / sessions, presets + custom.
      <!-- done: works via focus → end-screen → long break every N-th session (defaults 25/5/15/4, all tweakable in Zen with presets + custom inputs, plus Settings → Notifications). Breaks count down server-less; skip/restart/pause kept; 250ms drift-corrected timer. -->
- [x] Task → Zen loop: task carries title/notes + session countdown; end screen
      Mark complete / Continue / Exit; `focus_completed` events logged.
      <!-- done: open tasks selected in Zen pick the session target (title shown top-left); POST /api/pomodoro on focus start, PATCH /:id/end {completed} on finish/cancel logs FOCUS_STARTED/COMPLETED/CANCELLED; focus end-screen offers Mark complete (POST /api/tasks/:id/complete when a task is attached), Continue→break, or Quit. -->
- [x] Additive backend settings: `pomodoroLongBreakMinutes`, `pomodoroSessionsPerCycle`.
      <!-- done: migration 20260922091123_phase4_zen adds two nullable int columns (verified: 1 user before/after, additive ALTER only, data untouched); accepted + returned by /api/auth/me; UpdateUserRequest/PomodoroSettings/UserCredentials updated. -->

## Phase 5 — Google Tasks + Calendar selection/dedup

Status: `done`

- [x] Real Google Tasks sync (OAuth `tasks` scope for read/write, stable external IDs,
      external/native boundary, idempotent).
      <!-- done: per-account `GoogleConnection` (sub/email/name/relink/errors/sync stamps/default
           list), so several Google accounts merge under one app user. Pulls every list incl.
           completed and hidden, pages through, keeps ETags and tombstones. Pushes create, edit,
           completion and delete, re-reading and retrying once on 412 so a change made in the
           Google Tasks app is not overwritten. A failed push is recorded on the account and the
           local write still succeeds. A list 404 is a permanent per-account "Tasks unavailable"
           note rather than a retry loop. Note Google has no time of day on a deadline, so a due
           is pushed as a date at noon UTC and read back as the UTC date. -->
- [x] Per-linked-calendar include/exclude choice (UI + backend flags) — `includeInDay`
      on `linked_google_calendars`, `PATCH /api/calendar/google/connections/:connectionId/calendars/:calendarId`,
      a checkbox in Settings → Integrations. A calendar can stay linked and keep syncing
      without reserving capacity.
- [x] Presentation-layer calendar dedup (merge same-title/time overlaps; preserve
      `googleEventId`/`sourceCalendarId`/source; never touch source events) —
      `apps/backend/src/services/calendarDedup.ts`, run when the day model is built.
      Folding never writes: a local copy wins over a synced one, an added qualifier
      like "(Room 4)" does not block a match, and two different qualifiers are left
      alone. Verified by `verify-calendar-dedup` (30) and `verify-calendar-inclusion` (18).
- [x] Onboarding "Connect Google Tasks" step.
      <!-- done: Onboarding.tsx is a two-step first-run card — name, then an optional
           offer to link Google that states plainly what is read-only (calendars) and what
           writes back (tasks). The step only appears when OAuth is configured *and* nothing is
           linked yet, so it never asks a question whose answer is already known. Choosing
           "Connect" completes onboarding before the redirect to Google's consent screen, so the
           card does not greet the user with the same question on the way back. Step change is a
           CSS keyframe, collapsed by both the prefers-reduced-motion query and the
           html.reduce-motion toggle. Both branches verified against the live API: a new user
           reports configured=true with 0 connections and gets two steps; a user with 5
           connections gets one. -->

## Phase 6 — Timetable expansion (additive, data preserved)

Status: `complete`

- [x] Optional slot fields: `type` (CLASS/LAB/EXAM/INTERNAL/HOLIDAY/EVENT), `weekNumber`,
      `location` — existing contract untouched.
- [x] New `TimetableEntry` model for date-based one-offs (exam, holiday, exception,
      rescheduled class).
- [x] Timetable UI: kind badges/colors, exception & one-off editor, keep OCR import + grid.
- [x] Calendar renders new kinds; attendance cron keeps generating only from CLASS slots.
- [x] Resolved timetable range, term origins, adjacent-week reschedules, holiday titles and
      course-less entries. `verify-timetable-entries` (60) and `verify-attendance-cron` (24).

### Multi-Google (folded in here, live-verified)

One app user now merges 5 linked Google accounts: calendars read-only, tasks read/write.

- [x] `GoogleConnection` per account (tokens, `sub`, email/name, relink, errors, sync stamps,
      default task list). `LinkedGoogleCalendar` keyed `(connectionId, id)`, so every account
      can own a calendar called `primary`.
- [x] Calendar sync fans out per account, isolates failures, and scopes unlink and remote
      deletion to one account/calendar. PATCH/DELETE address a calendar through its account.
- [x] Cross-account dedup: same normalised title within five minutes collapses to one entry in
      the day view, while each copy is still stored. Live: 18 calendars, 2,830 events, 1,273
      duplicate rows, and exactly one Holi / Diwali / Dussehra in the day view.
- [x] Tasks read/write: pull every list incl. completed and hidden, page through, keep ETags and
      tombstones; push create, edit, completion and delete with a 412 re-read-and-retry.
- [x] A Google task deadline is a **date**, not an instant. The API rejects a `due` with no
      offset and then discards the time of day regardless of what is sent, so the date is pushed
      at noon UTC and read back as the UTC date. A local time of day is kept locally and is never
      overwritten by a sync.
- [x] Settings lists every account with status, errors, last sync, reconnect, disconnect and its
      grouped calendars.
- [x] Verified live: 5/5 accounts sync calendars and tasks, 0 failures. `chiragrkaranth.ec24@rvce.edu.in`
      returns 404 for Tasks and is reported as a permanent per-account capability note, Calendar
      unaffected. `verify-google-multi-account` (31), `verify-calendar-inclusion` (18),
      `verify-calendar-dedup` (30), `verify-tz` (29).

Known limits: Tasks refresh tokens in unverified OAuth Testing mode expire after seven days
(reconnect from Settings); each further account needs interactive browser consent.

## Phase 7 — Notifications

Status: `pending`

- [ ] Attendance prompts via Web Push (VAPID + existing `/sw.js`).
- [ ] Android FCM path wired (`fcm.ts` + `firebase-admin`), dedup via additive
      `attendancePromptedAt`, dismiss on resolve/auto-mark.
- [ ] Per-type notification controls on the user (Attendance / Calendar / Tasks / Focus).
- [ ] Desktop bell surfaces latest attendance/event/focus notifications.
- [ ] Settings → Notifications functional; `.env.example`/compose gains `VAPID_*` + FCM vars.

## Phase 8 — Analytics

Status: `partial`

- [x] Analytics page: focus minutes/sessions, planned-vs-completed, focus time by course.
      <!-- done: renamed to Review and rebuilt as intent-vs-reality rather than a tally. Reads
           GET /api/review?period=day|week. Shows planned / completed / focused on one scale,
           focus-by-hour rhythm, each day planned against what it could hold, estimate accuracy
           centred on "as estimated", and patterns carrying their own sample size. The /analytics
           route is kept so existing links keep working. -->
- [x] Custom SVG charts animated with anime.js (no new dependency).
      <!-- done: RhythmChart, PlannedVsAvailable and AccuracyChart are hand-rolled SVG in
           apps/web/src/components/review/Charts.tsx. Bars grow from the baseline via the Web
           Animations API, skipped under prefers-reduced-motion. No charting library added. -->
- [x] Patterns engine that refuses to over-claim.
      <!-- done: apps/backend/src/services/review.ts. Six pattern families (underestimate,
           best hour, postponement, abandonment, overload, steady), each gated on a sample-size
           floor, with confidence derived from sample size rather than asserted. Accuracy is
           rolled up per task before per course, so a three-session task cannot triple-count
           its estimate. "Completed" is measured in estimates so it is comparable to "planned". -->
- [ ] Attendance trends and daily/monthly activity.
      <!-- not done: the existing attendance screen already covers per-course rates; the Review
           screen was scoped to intent vs reality. Monthly rollups are a natural next slice. -->
- [ ] R analytics engine: optional Docker `analytics` service (r-base) analyzing exported
      snapshots (time-series, distributions, anomalies) — clean boundary, R never touches the DB.

## Phase 9 — Polish & final design test

Status: `pending`

- [ ] Page/sidebar/modal/chart entrance animations (subtle, hierarchy-supporting); reduced-motion
      respected everywhere.
      <!-- partial: Today and Review respect prefers-reduced-motion and animate on entry. The
           remaining pages still use the older entrance transitions. -->
- [x] Purposeful empty states on Today and Review.
      <!-- done: each empty state says what is missing and what would fill it, rather than
           apologising for having no data. Review's "nothing conclusive yet" explains that
           patterns need repeated evidence. -->
- [ ] Designer pass across all pages against the PLAN → FOCUS → UNDERSTAND composition.
- [x] Full verification sweep (build, typecheck, migration checks, live smoke tests).
      <!-- done: pnpm build green; backend + web typecheck green; all 5 backend verification
           scripts green (timezone arithmetic 29 checks incl. DST, capacity against the real
           timetable, over-capacity + displacement, full planning loop against the live prod
           API, endpoint smoke). Prod data proven unchanged against a pre-migration backup by
           projecting the live tables onto the backup's own column set: 84 rows byte-identical,
           timetable included. -->
- [x] `pnpm lint`.
      <!-- done: web lint is `eslint .` on a flat config (apps/web/eslint.config.mjs) with
           eslint + eslint-config-next installed, so the Next 16 breakage no longer applies.
           Whole-repo `pnpm lint` is green: 0 errors, 11 warnings, all pre-existing and
           unrelated (one `react-hooks/set-state-in-effect` in apps/web/src/lib/auth.tsx for
           the hydration flag, the rest hook-dependency and unused-var notes). Left as
           warnings rather than suppressed so they stay visible. -->
- [ ] README refresh; `ROADMAP.md` final status.

---

## Explicitly out of scope (per brief §36)

No social features, leaderboards, XP, coins, badges, fake productivity scores, AI chatbot,
excessive gamification. `apps/mobile` remains in the repo but is not a product surface.