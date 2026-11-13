import {
  type Document,
  ListDocumentsResponseSchema,
  UploadDocumentResponseSchema,
} from "@quizqrafter/shared";
import { expectOk } from "../http";
import type { DocumentService } from "./types";

export class QuizQrafterDocumentService implements DocumentService {
  constructor(private readonly baseURL: URL) {}

  async upload(file: File): Promise<Document> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(new URL("/api/v1/document/upload", this.baseURL), {
      method: "POST",
      credentials: "include",
      body: formData,
      headers: { Accept: "application/json" },
    });
    await expectOk(response, "Failed to upload file");
    return UploadDocumentResponseSchema.parse(await response.json()).document;
  }

  async list(): Promise<Document[]> {
    const response = await fetch(new URL("/api/v1/document", this.baseURL), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    await expectOk(response, "Failed to load your documents");
    return ListDocumentsResponseSchema.parse(await response.json()).documents;
  }
}
