import type { QuizDraft } from "@quizqrafter/shared";

// Turns an uploaded file (PDF, image, text) into plain text.
export interface TextExtractor {
  extract(content: Buffer, mimeType: string): Promise<string>;
}

// Stores files. `put` returns a URL that `get` accepts later.
export interface BlobStore {
  put(key: string, data: Buffer | string): Promise<string>;
  get(url: string): Promise<Buffer>;
}

// Writes a quiz from the text of a document.
export interface QuizGenerator {
  generate(documentText: string): Promise<QuizDraft>;
}

export type Providers = {
  extractor: TextExtractor;
  blobs: BlobStore;
  generator: QuizGenerator;
};
