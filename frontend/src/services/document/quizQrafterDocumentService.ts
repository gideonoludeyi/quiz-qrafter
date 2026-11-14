import {
  type Document,
  type GenerateQuizJob,
  GenerateQuizJobSchema,
  ListDocumentsResponseSchema,
  UploadDocumentResponseSchema,
} from "@quizqrafter/shared";
import { expectOk, request, type RequestResult } from "../http";
import type { DocumentService } from "./types";

export class QuizQrafterDocumentService implements DocumentService {
  constructor(private readonly baseURL: URL) {}

  upload(file: File): Promise<RequestResult<{ document: Document; job: GenerateQuizJob }>> {
    const form = new FormData();
    form.append("file", file);
    return request(new URL("/api/v1/document/upload", this.baseURL), UploadDocumentResponseSchema, {
      method: "POST",
      form,
    });
  }

  async list(): Promise<RequestResult<Document[]>> {
    const result = await request(
      new URL("/api/v1/document", this.baseURL),
      ListDocumentsResponseSchema,
    );
    return result.ok ? { ok: true, value: result.value.documents } : result;
  }

  startJob(documentId: number): Promise<RequestResult<GenerateQuizJob>> {
    return request(new URL("/api/v1/jobs", this.baseURL), GenerateQuizJobSchema, {
      method: "POST",
      json: { documentId },
    });
  }

  async getFile(id: number): Promise<Blob> {
    const response = await fetch(new URL(`/api/v1/document/${id}/file`, this.baseURL), {
      credentials: "include",
    });
    await expectOk(response, "Failed to load the document");
    return response.blob();
  }

  async getText(id: number): Promise<string> {
    const response = await fetch(new URL(`/api/v1/document/${id}/text`, this.baseURL), {
      credentials: "include",
    });
    await expectOk(response, "Failed to load the document's text");
    return response.text();
  }
}
