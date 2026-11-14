/*
  Warnings:

  - The values [saving] on the enum `JobStage` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
-- Jobs caught mid-save would block the type change; the stage is only a progress hint.
UPDATE "quiz_jobs" SET "stage" = NULL WHERE "stage" = 'saving';
CREATE TYPE "JobStage_new" AS ENUM ('reading', 'writing');
ALTER TABLE "quiz_jobs" ALTER COLUMN "stage" TYPE "JobStage_new" USING ("stage"::text::"JobStage_new");
ALTER TYPE "JobStage" RENAME TO "JobStage_old";
ALTER TYPE "JobStage_new" RENAME TO "JobStage";
DROP TYPE "JobStage_old";
COMMIT;
