-- BullMQ now schedules retries and detects dead workers, so the polling columns go.

-- DropIndex
DROP INDEX "quiz_jobs_status_runAfter_idx";

-- AlterTable
ALTER TABLE "quiz_jobs" DROP COLUMN "heartbeatAt",
DROP COLUMN "runAfter";

-- CreateIndex
CREATE INDEX "quiz_jobs_status_idx" ON "quiz_jobs"("status");
