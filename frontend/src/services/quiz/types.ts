import type { Quiz, QuizDraft, GenerateQuizJob } from "@quizqrafter/shared";

export interface QuizService {
  // Starts a job that writes a quiz for a document, replacing its existing quiz when done.
  startJob(documentId: number): Promise<GenerateQuizJob>;
  getJob(id: number): Promise<GenerateQuizJob>;
  get(id: number): Promise<Quiz>;
  update(id: number, draft: QuizDraft): Promise<Quiz>;
  remove(id: number): Promise<void>;
  exportPdf(id: number): Promise<Blob>;
}
