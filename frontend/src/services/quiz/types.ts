import type { Quiz, QuizDraft } from "@quizqrafter/shared";
import type { RequestResult } from "../http";

export interface QuizService {
  get(id: number): Promise<RequestResult<Quiz>>;
  update(id: number, draft: QuizDraft): Promise<RequestResult<Quiz>>;
  remove(id: number): Promise<RequestResult<void>>;
  exportPdf(id: number): Promise<RequestResult<Blob>>;
}
