-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "JobStage" AS ENUM ('reading', 'writing', 'saving');

-- AlterTable
-- Existing documents already have transcripts, so their file type is never needed.
ALTER TABLE "documents" ADD COLUMN     "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
ALTER COLUMN "transcriptionURL" DROP NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "mimeType" DROP DEFAULT;

-- CreateTable
CREATE TABLE "quiz_jobs" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "stage" "JobStage",
    "questionsWritten" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "quiz_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quiz_jobs_status_runAfter_idx" ON "quiz_jobs"("status", "runAfter");

-- CreateIndex
CREATE INDEX "quiz_jobs_documentId_idx" ON "quiz_jobs"("documentId");

-- AddForeignKey
ALTER TABLE "quiz_jobs" ADD CONSTRAINT "quiz_jobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one queued or running job per document, even under concurrent requests.
CREATE UNIQUE INDEX "quiz_jobs_one_active_per_document" ON "quiz_jobs"("documentId")
WHERE "status" IN ('queued', 'running');
