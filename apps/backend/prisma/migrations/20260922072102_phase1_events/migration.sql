-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TASK_CREATED', 'TASK_COMPLETED', 'TASK_UNCOMPLETED', 'TASK_UPDATED', 'TASK_DELETED', 'FOCUS_STARTED', 'FOCUS_COMPLETED', 'FOCUS_CANCELLED', 'ATTENDANCE_RECORDED', 'CLASS_SCHEDULED', 'CALENDAR_EVENT_SYNCED', 'CALENDAR_EVENT_UPDATED', 'GOOGLE_TASK_SYNCED');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_userId_occurredAt_idx" ON "events"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "events_userId_type_idx" ON "events"("userId", "type");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
