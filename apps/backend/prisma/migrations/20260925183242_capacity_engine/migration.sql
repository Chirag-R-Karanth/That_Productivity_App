-- AlterTable
ALTER TABLE "pomodoro_sessions" ADD COLUMN     "actualMinutes" INTEGER,
ADD COLUMN     "endedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "estimateMinutes" INTEGER,
ADD COLUMN     "plannedDate" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bufferMinutes" INTEGER,
ADD COLUMN     "dayEndMinutes" INTEGER,
ADD COLUMN     "dayStartMinutes" INTEGER;

-- CreateIndex
CREATE INDEX "tasks_userId_plannedDate_idx" ON "tasks"("userId", "plannedDate");
