import {
  type Document,
  type GenerateQuizJob,
  GenerateQuizJobSchema,
  ListDocumentsResponseSchema,
  UploadDocumentResponseSchema,
} from "@quizqrafter/shared";
import { asBlob, asJson, asText, noBody, request, type RequestResult } from "../http";
import type { DocumentService } from "./types";

export class QuizQrafterDocumentService implements DocumentService {
  constructor(private readonly baseURL: URL) {}

  upload(file: File): Promise<RequestResult<{ document: Document; job: GenerateQuizJob }>> {
    const form = new FormData();
    form.append("file", file);
    return request(
      new URL("/api/v1/document/upload", this.baseURL),
      asJson(UploadDocumentResponseSchema),
      {
        method: "POST",
        form,
      },
    );
  }

  async list(): Promise<RequestResult<Document[]>> {
    const result = await request(
      new URL("/api/v1/document", this.baseURL),
      asJson(ListDocumentsResponseSchema),
    );
    return result.ok ? { ok: true, value: result.value.documents } : result;
  }

  startJob(documentId: number): Promise<RequestResult<GenerateQuizJob>> {
    return request(new URL("/api/v1/jobs", this.baseURL), asJson(GenerateQuizJobSchema), {
      method: "POST",
      json: { documentId },
    });
  }

  remove(documentId: number): Promise<RequestResult<void>> {
    return request(new URL(`/api/v1/document/${documentId}`, this.baseURL), noBody, {
      method: "DELETE",
    });
  }

  getFile(id: number): Promise<RequestResult<Blob>> {
    return request(new URL(`/api/v1/document/${id}/file`, this.baseURL), asBlob());
  }

  getText(id: number): Promise<RequestResult<string>> {
    return request(new URL(`/api/v1/document/${id}/text`, this.baseURL), asText);
  }
}
