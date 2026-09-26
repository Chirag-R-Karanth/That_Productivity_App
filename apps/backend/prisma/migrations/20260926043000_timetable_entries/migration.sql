-- CreateEnum
CREATE TYPE "TimetableEntryKind" AS ENUM ('EXAM', 'HOLIDAY', 'EXCEPTION', 'RESCHEDULED', 'EVENT');

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "kind" "TimetableEntryKind" NOT NULL DEFAULT 'EVENT',
    "date" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "replacesSlot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_entries_userId_date_idx" ON "timetable_entries"("userId", "date");

-- CreateIndex
CREATE INDEX "timetable_entries_userId_date_startTime_idx" ON "timetable_entries"("userId", "date", "startTime");

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
