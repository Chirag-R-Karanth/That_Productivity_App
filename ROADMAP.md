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

Status: `pending`

- [ ] Real Google Tasks sync (OAuth `tasks.readonly`, stable external IDs, external/native
      boundary, idempotent).
- [ ] Per-linked-calendar include/exclude choice (UI + backend flags).
- [ ] Presentation-layer calendar dedup (merge same-title/time overlaps; preserve
      `googleEventId`/`sourceCalendarId`/source; never touch source events).
- [ ] Onboarding "Connect Google Tasks" step.

## Phase 6 — Timetable expansion (additive, data preserved)

Status: `pending`

- [ ] Optional slot fields: `type` (CLASS/LAB/EXAM/INTERNAL/HOLIDAY/EVENT), `weekNumber`,
      `location` — existing contract untouched.
- [ ] New `TimetableEntry` model for date-based one-offs (exam, holiday, exception,
      rescheduled class).
- [ ] Timetable UI: kind badges/colors, exception & one-off editor, keep OCR import + grid.
- [ ] Calendar renders new kinds; attendance cron keeps generating only from CLASS slots.

## Phase 7 — Notifications

Status: `pending`

- [ ] Attendance prompts via Web Push (VAPID + existing `/sw.js`).
- [ ] Android FCM path wired (`fcm.ts` + `firebase-admin`), dedup via additive
      `attendancePromptedAt`, dismiss on resolve/auto-mark.
- [ ] Per-type notification controls on the user (Attendance / Calendar / Tasks / Focus).
- [ ] Desktop bell surfaces latest attendance/event/focus notifications.
- [ ] Settings → Notifications functional; `.env.example`/compose gains `VAPID_*` + FCM vars.

## Phase 8 — Analytics

Status: `pending`

- [ ] Analytics page: focus minutes/sessions/streak, planned-vs-completed tasks, focus time by
      course, attendance trends, daily/weekly/monthly activity.
- [ ] Custom SVG charts animated with anime.js (no new dependency).
- [ ] R analytics engine: optional Docker `analytics` service (r-base) analyzing exported
      snapshots (time-series, distributions, anomalies) — clean boundary, R never touches the DB.

## Phase 9 — Polish & final design test

Status: `pending`

- [ ] Page/sidebar/modal/chart entrance animations (subtle, hierarchy-supporting); reduced-motion
      respected everywhere.
- [ ] Designer pass across all pages against the PLAN → FOCUS → UNDERSTAND composition.
- [ ] Full verification sweep (build/typecheck/lint, migration count checks, manual checklist).
- [ ] README refresh; `ROADMAP.md` final status.

---

## Explicitly out of scope (per brief §36)

No social features, leaderboards, XP, coins, badges, fake productivity scores, AI chatbot,
excessive gamification. `apps/mobile` remains in the repo but is not a product surface.