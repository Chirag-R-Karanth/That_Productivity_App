-- CreateEnum
CREATE TYPE "CalendarEventSource" AS ENUM ('LOCAL', 'GOOGLE');

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "allDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "source" "CalendarEventSource" NOT NULL DEFAULT 'LOCAL',
ALTER COLUMN "googleEventId" DROP NOT NULL,
ALTER COLUMN "sourceCalendarId" DROP NOT NULL;
