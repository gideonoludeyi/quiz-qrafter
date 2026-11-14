-- Renames quiz_jobs to generate_quiz_jobs with everything that carries its name, keeping its rows.
-- (Prisma would generate a drop and a create for this, losing them.)
ALTER TABLE "quiz_jobs" RENAME TO "generate_quiz_jobs";
ALTER SEQUENCE "quiz_jobs_id_seq" RENAME TO "generate_quiz_jobs_id_seq";
ALTER TABLE "generate_quiz_jobs" RENAME CONSTRAINT "quiz_jobs_pkey" TO "generate_quiz_jobs_pkey";
ALTER TABLE "generate_quiz_jobs" RENAME CONSTRAINT "quiz_jobs_documentId_fkey" TO "generate_quiz_jobs_documentId_fkey";
ALTER INDEX "quiz_jobs_status_idx" RENAME TO "generate_quiz_jobs_status_idx";
ALTER INDEX "quiz_jobs_documentId_idx" RENAME TO "generate_quiz_jobs_documentId_idx";
ALTER INDEX "quiz_jobs_one_active_per_document" RENAME TO "generate_quiz_jobs_one_active_per_document";
