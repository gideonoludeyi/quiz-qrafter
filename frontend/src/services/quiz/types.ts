import type { Quiz, QuizDraft } from "@quizqrafter/shared";

export interface QuizService {
  // Generates a quiz for a document, replacing the document's existing quiz.
  generate(documentId: number): Promise<Quiz>;
  get(id: number): Promise<Quiz>;
  update(id: number, draft: QuizDraft): Promise<Quiz>;
  remove(id: number): Promise<void>;
  exportPdf(id: number): Promise<Blob>;
}
