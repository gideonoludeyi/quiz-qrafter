-- A failed GenerateQuizJob records an error code (a catalogue key under errors.*) and the
-- values its message needs, instead of an English sentence, so the frontend can word it.
ALTER TABLE "generate_quiz_jobs" ADD COLUMN "errorCode" TEXT,
ADD COLUMN "errorValues" JSONB;

-- Each sentence the backend has written maps to its code; anything else becomes the generic one.
UPDATE "generate_quiz_jobs" SET "errorCode" = CASE "error"
    WHEN 'Something went wrong while making your quiz. Please try again.' THEN 'errors.jobs.generic'
    WHEN 'Your quiz couldn''t be started. Please try again.' THEN 'errors.jobs.notQueued'
    WHEN 'This file type can''t be read. Upload a PDF, image, Word or text file.' THEN 'errors.jobs.unreadableFileType'
    WHEN 'No text was found in this file.' THEN 'errors.jobs.noText'
    WHEN 'This Word file could not be opened.' THEN 'errors.jobs.wordFileUnreadable'
    WHEN 'The AI service rejected this request. Please contact support.' THEN 'errors.jobs.aiRejected'
    WHEN 'The AI declined to read this file.' THEN 'errors.jobs.aiDeclinedReading'
    WHEN 'The AI declined to write a quiz from this document.' THEN 'errors.jobs.aiDeclinedWriting'
    WHEN 'The quiz was cut off before it was complete. Try again, or upload a shorter document.' THEN 'errors.jobs.quizCutOff'
    WHEN 'This document is too long to read in full. Split it into smaller files and upload them separately.' THEN 'errors.jobs.documentTooLong'
    WHEN 'The fake AI was asked to fail.' THEN 'errors.jobs.fakeFailure'
    ELSE 'errors.jobs.generic'
END
WHERE "error" IS NOT NULL;

ALTER TABLE "generate_quiz_jobs" DROP COLUMN "error";
