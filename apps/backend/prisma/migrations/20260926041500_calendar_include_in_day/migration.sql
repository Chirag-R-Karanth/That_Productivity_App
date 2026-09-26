-- Additive: let a linked Google calendar be kept in sync but left out of the
-- day model. Some calendars are worth mirroring (so they appear in Review and
-- in search) without being worth reserving capacity for, and one shared inbox
-- can otherwise swamp the timeline.
--
-- Defaults to true so every already-linked calendar behaves exactly as before.
ALTER TABLE "linked_google_calendars" ADD COLUMN "includeInDay" BOOLEAN NOT NULL DEFAULT true;
