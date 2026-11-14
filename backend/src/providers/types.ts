import type { QuizDraft } from "@quizqrafter/shared";
import type { EmailSender } from "./email/types";

// Reads the text of a PDF or image, the files the server can't read itself.
export interface Transcriber {
  transcribe(content: Buffer, mimeType: string): Promise<string>;
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
  transcriber: Transcriber;
  blobs: BlobStore;
  generator: QuizGenerator;
  email: EmailSender;
};
