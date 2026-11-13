import type { Document } from "@quizqrafter/shared";

export interface DocumentService {
  upload(file: File): Promise<Document>;
  list(): Promise<Document[]>;
}
