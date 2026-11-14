import type { Quiz, QuizDraft } from "@quizqrafter/shared";

export interface QuizService {
  get(id: number): Promise<Quiz>;
  update(id: number, draft: QuizDraft): Promise<Quiz>;
  remove(id: number): Promise<void>;
  exportPdf(id: number): Promise<Blob>;
}
