-- Additive: record the user's IANA timezone so "today" is resolved where the
-- user is, not wherever the server happens to run. Nullable, so existing rows
-- are untouched and the app falls back to the zone the request reports.
ALTER TABLE "users" ADD COLUMN "timezone" TEXT;
