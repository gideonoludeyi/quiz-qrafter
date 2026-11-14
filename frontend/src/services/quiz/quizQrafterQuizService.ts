import { type Quiz, type QuizDraft, QuizSchema } from "@quizqrafter/shared";
import { expectOk } from "../http";
import type { QuizService } from "./types";

const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" };

export class QuizQrafterQuizService implements QuizService {
  constructor(private readonly baseURL: URL) {}

  async get(id: number): Promise<Quiz> {
    const res = await fetch(new URL(`/api/v1/quiz/${id}`, this.baseURL), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    await expectOk(res, "Failed to load the quiz");
    return QuizSchema.parse(await res.json());
  }

  async update(id: number, draft: QuizDraft): Promise<Quiz> {
    const res = await fetch(new URL(`/api/v1/quiz/${id}`, this.baseURL), {
      method: "PUT",
      credentials: "include",
      headers: JSON_HEADERS,
      body: JSON.stringify(draft),
    });
    await expectOk(res, "Failed to save the quiz");
    return QuizSchema.parse(await res.json());
  }

  async remove(id: number): Promise<void> {
    const res = await fetch(new URL(`/api/v1/quiz/${id}`, this.baseURL), {
      method: "DELETE",
      credentials: "include",
    });
    await expectOk(res, "Failed to delete the quiz");
  }

  async exportPdf(id: number): Promise<Blob> {
    const res = await fetch(new URL(`/api/v1/quiz/${id}/export?format=pdf`, this.baseURL), {
      credentials: "include",
      headers: { Accept: "application/pdf" },
    });
    await expectOk(res, "Failed to download the PDF");
    return res.blob();
  }
}
