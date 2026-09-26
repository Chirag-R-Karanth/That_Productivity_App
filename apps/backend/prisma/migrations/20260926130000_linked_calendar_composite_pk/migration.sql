-- A linked Google calendar is identified by its account as well as its id.
--
-- The previous migration added `connectionId` and a `unique(connectionId, id)`
-- index, but left the original single-column primary key on `id` in place. That
-- is the one thing that cannot survive a second account: every Google account
-- has a calendar called `primary`, so account two's `primary` collided with
-- account one's and the second link could never be stored.
--
-- The unique index added alongside is redundant once the pair is the primary
-- key, so it goes rather than being left behind to drift.

-- AlterTable
ALTER TABLE "linked_google_calendars" DROP CONSTRAINT "linked_google_calendars_pkey";

-- AlterTable
ALTER TABLE "linked_google_calendars" ADD CONSTRAINT "linked_google_calendars_pkey" PRIMARY KEY ("connectionId", "id");

-- DropIndex
DROP INDEX "linked_google_calendars_connectionId_id_key";
