-- Phase 7: Web Push subscriptions, per-type notification controls, and a
-- "we already asked" stamp on attendance records.
--
-- Additive only. No existing column changes type or meaning, no existing row
-- is touched, and every new column is either nullable or carries a default, so
-- this can be applied to a live database without a data migration.

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- The browser endpoint is the identity: one browser, one subscription, one
-- row. Re-subscribing updates in place instead of piling up dead rows that
-- would each keep costing a failed delivery on every prompt.
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- One row per (user, browser). The per-user index is what the dispatcher walks
-- when it fans a message out to a user's devices.
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-type notification controls. Default true: the user cannot reach these
-- without already having granted the browser permission and registered a
-- subscription, so a channel is on until it is deliberately switched off.
ALTER TABLE "users" ADD COLUMN     "notifyAttendance" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN     "notifyCalendar" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN     "notifyTasks" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN     "notifyFocus" BOOLEAN NOT NULL DEFAULT true;

-- "When did we last ask about this record?" A null value means never asked,
-- which is what keeps the 15-minute prompt cron from repeating one question
-- all evening. It is a question, not an answer, so it says nothing about the
-- record's real status.
ALTER TABLE "attendance_records" ADD COLUMN "attendancePromptedAt" TIMESTAMP(3);
