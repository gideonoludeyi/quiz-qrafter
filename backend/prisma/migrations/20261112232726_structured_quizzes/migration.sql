-- Old quizzes only pointed at a rendered PDF, so they cannot be converted to structured questions.
DELETE FROM "quizzes";

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('multiple_choice', 'true_false', 'short_answer');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "filename" TEXT;

-- Backfill filename from rawURL, e.g. gs://quizqrafter-documents/u1-notes.pdf -> notes.pdf
UPDATE "documents" SET "filename" = regexp_replace("rawURL", '^gs://[^/]+/u[0-9]+-', '');
ALTER TABLE "documents" ALTER COLUMN "filename" SET NOT NULL;

-- AlterTable
ALTER TABLE "quizzes" DROP COLUMN "urlPdf",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "questions" (
    "id" SERIAL NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "choices" TEXT[],
    "answer" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "sourceQuote" TEXT,
    "quizId" INTEGER NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questions_quizId_idx" ON "questions"("quizId");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
