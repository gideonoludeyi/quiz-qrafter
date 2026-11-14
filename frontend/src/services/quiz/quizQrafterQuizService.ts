import { type Quiz, type QuizDraft, QuizSchema } from "@quizqrafter/shared";
import { asBlob, asJson, noBody, request, type RequestResult } from "../http";
import type { QuizService } from "./types";

export class QuizQrafterQuizService implements QuizService {
  constructor(private readonly baseURL: URL) {}

  private url(path: string) {
    return new URL(`/api/v1/quiz/${path}`, this.baseURL);
  }

  get(id: number): Promise<RequestResult<Quiz>> {
    return request(this.url(`${id}`), asJson(QuizSchema));
  }

  update(id: number, draft: QuizDraft): Promise<RequestResult<Quiz>> {
    return request(this.url(`${id}`), asJson(QuizSchema), { method: "PUT", json: draft });
  }

  remove(id: number): Promise<RequestResult<void>> {
    return request(this.url(`${id}`), noBody, { method: "DELETE" });
  }

  exportPdf(id: number): Promise<RequestResult<Blob>> {
    return request(this.url(`${id}/export?format=pdf`), asBlob("application/pdf"));
  }
}
