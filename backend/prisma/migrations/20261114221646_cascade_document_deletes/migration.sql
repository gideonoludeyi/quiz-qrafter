-- Deleting a Document deletes its Quiz, and deleting a user deletes their Documents.
-- The app deletes Documents itself first, so their stored files go too; the cascade is a backstop.
ALTER TABLE "quizzes" DROP CONSTRAINT "quizzes_documentId_fkey";
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents" DROP CONSTRAINT "documents_userId_fkey";
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
