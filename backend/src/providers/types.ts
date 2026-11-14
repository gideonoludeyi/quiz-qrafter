import type { QuizDraft } from "@quizqrafter/shared";
import type { EmailSender } from "./email/types";

// Turns an uploaded file (PDF, image, Word, text) into plain text.
export interface TextExtractor {
  extract(content: Buffer, mimeType: string): Promise<string>;
}

// Stores files. `put` returns a URL that `get` accepts later.
export interface BlobStore {
  put(key: string, data: Buffer | string): Promise<string>;
  get(url: string): Promise<Buffer>;
  // Deletes a stored file; deleting one that is already gone is not an error.
  delete(url: string): Promise<void>;
}

// Writes a quiz from the text of a document, reporting how many questions are written so far.
export interface QuizGenerator {
  generate(
    documentText: string,
    onProgress?: (questionsWritten: number) => void,
  ): Promise<QuizDraft>;
}

export type Providers = {
  extractor: TextExtractor;
  blobs: BlobStore;
  generator: QuizGenerator;
  email: EmailSender;
};
