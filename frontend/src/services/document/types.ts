import type { Document, QuizJob } from "@quizqrafter/shared";

export interface DocumentService {
  // Stores the file and starts the job that reads it and writes its quiz.
  upload(file: File): Promise<{ document: Document; job: QuizJob }>;
  list(): Promise<Document[]>;
}
