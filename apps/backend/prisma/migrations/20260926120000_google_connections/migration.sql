-- Multi-Google-account support.
--
-- A user could previously hold exactly one Google identity, because the tokens
-- lived on `users`. Seven Google accounts feeding one user needs a row per
-- account, so tokens move to a new `google_connections` table and calendars,
-- events and tasks point at the connection they came from.
--
-- Two ordering details matter here:
--   * `linked_google_calendars.connectionId` is added as NULLABLE, backfilled,
--     and only then made NOT NULL. Adding it NOT NULL straight away fails on
--     any database that already has a linked calendar.
--   * The old unique key on calendar events is dropped before the column that
--     made it wrong is relied on. That key could not survive a second account:
--     a Google event id is unique only within one calendar of one account, and
--     every account has a calendar called `primary`.

-- CreateTable
CREATE TABLE "google_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    -- Where locally created tasks are pushed. Null until the account's task
    -- lists have been listed once; discovery fills it in on first use, so a
    -- user with no Google Tasks is not forced to create a list.
    "defaultTaskListId" TEXT,
    "needsRelink" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_connections_pkey" PRIMARY KEY ("id")
);

-- The previous key cannot identify an event once a second account is linked.
DROP INDEX "calendar_events_userId_googleEventId_sourceCalendarId_key";
DROP INDEX "linked_google_calendars_userId_id_key";

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN "connectionId" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "connectionId" TEXT,
ADD COLUMN "googleDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "googleETag" TEXT,
ADD COLUMN "googlePushedAt" TIMESTAMP(3),
ADD COLUMN "googleTaskId" TEXT,
ADD COLUMN "googleTaskListId" TEXT;

-- Added nullable on purpose; see the note above.
ALTER TABLE "linked_google_calendars" ADD COLUMN "connectionId" TEXT;

-- Backfill: turn each user's single stored token into one connection, so
-- anyone already linked keeps syncing instead of silently going dark. The
-- `legacy:` prefix is a real key rather than a guess at the account id, because
-- the old code never recorded Google's own account id; the first re-link
-- replaces it with the true one.
INSERT INTO "google_connections" (
    "id", "userId", "googleAccountId", "email", "accessToken", "refreshToken",
    "tokenExpiresAt", "scopes", "createdAt", "updatedAt"
)
SELECT
    'legacy_' || md5(u."id" || ':' || coalesce(u."email", '')),
    u."id",
    'legacy:' || u."email",
    u."email",
    u."googleAccessToken",
    u."googleRefreshToken",
    u."googleTokenExpiresAt",
    'https://www.googleapis.com/auth/calendar.readonly',
    u."createdAt",
    now()
FROM "users" u
WHERE u."googleAccessToken" IS NOT NULL;

-- Point each existing calendar (and its events) at its owner's new connection.
UPDATE "linked_google_calendars" lgc
SET "connectionId" = gc."id"
FROM "google_connections" gc
WHERE gc."userId" = lgc."userId"
  AND gc."googleAccountId" = 'legacy:' || (
    SELECT u."email" FROM "users" u WHERE u."id" = lgc."userId"
  )
  AND lgc."connectionId" IS NULL;

UPDATE "calendar_events" ce
SET "connectionId" = gc."id"
FROM "google_connections" gc
WHERE gc."userId" = ce."userId"
  AND gc."googleAccountId" = 'legacy:' || (
    SELECT u."email" FROM "users" u WHERE u."id" = ce."userId"
  )
  AND ce."source" = 'GOOGLE'
  AND ce."connectionId" IS NULL;

-- A calendar with no connection cannot be honoured, and the column is NOT NULL.
-- That can only happen for a row whose owner's token was already gone, which
-- means the calendar was unusable before this migration too.
DELETE FROM "linked_google_calendars" WHERE "connectionId" IS NULL;

-- AlterTable
ALTER TABLE "linked_google_calendars" ALTER COLUMN "connectionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "google_connections_userId_needsRelink_idx" ON "google_connections"("userId", "needsRelink");

-- One row per Google account per user: re-linking updates rather than duplicates.
CREATE UNIQUE INDEX "google_connections_userId_googleAccountId_key" ON "google_connections"("userId", "googleAccountId");

-- CreateIndex
CREATE INDEX "calendar_events_userId_connectionId_googleEventId_sourceCal_idx" ON "calendar_events"("userId", "connectionId", "googleEventId", "sourceCalendarId");

-- CreateIndex
CREATE INDEX "linked_google_calendars_userId_idx" ON "linked_google_calendars"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "linked_google_calendars_connectionId_id_key" ON "linked_google_calendars"("connectionId", "id");

-- CreateIndex
CREATE INDEX "tasks_userId_connectionId_googleTaskId_idx" ON "tasks"("userId", "connectionId", "googleTaskId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "google_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "google_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_google_calendars" ADD CONSTRAINT "linked_google_calendars_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "google_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
