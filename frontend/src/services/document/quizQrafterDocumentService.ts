import {
  type Document,
  type QuizJob,
  ListDocumentsResponseSchema,
  UploadDocumentResponseSchema,
} from "@quizqrafter/shared";
import { expectOk } from "../http";
import type { DocumentService } from "./types";

export class QuizQrafterDocumentService implements DocumentService {
  constructor(private readonly baseURL: URL) {}

  async upload(file: File): Promise<{ document: Document; job: QuizJob }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(new URL("/api/v1/document/upload", this.baseURL), {
      method: "POST",
      credentials: "include",
      body: formData,
      headers: { Accept: "application/json" },
    });
    await expectOk(response, "Failed to upload file");
    return UploadDocumentResponseSchema.parse(await response.json());
  }

  async list(): Promise<Document[]> {
    const response = await fetch(new URL("/api/v1/document", this.baseURL), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    await expectOk(response, "Failed to load your documents");
    return ListDocumentsResponseSchema.parse(await response.json()).documents;
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
