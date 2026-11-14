import type { Document, GenerateQuizJob } from "@quizqrafter/shared";
import type { RequestResult } from "../http";

// The requests the documents store makes, so tests can pass a fake.
export interface DocumentJobService {
  // Stores the file and starts the GenerateQuizJob that reads it and writes its quiz.
  upload(file: File): Promise<RequestResult<{ document: Document; job: GenerateQuizJob }>>;
  // The user's documents, newest first.
  list(): Promise<RequestResult<Document[]>>;
  // Starts a GenerateQuizJob for a document, replacing its existing quiz when done.
  startJob(documentId: number): Promise<RequestResult<GenerateQuizJob>>;
  // Deletes a document with its quiz, jobs and stored files.
  remove(documentId: number): Promise<RequestResult<void>>;
}

export interface DocumentService extends DocumentJobService {
  // The document's original file, for the viewer.
  getFile(id: number): Promise<RequestResult<Blob>>;
  // A Word document's text, which the viewer shows in place of the .docx file.
  getText(id: number): Promise<RequestResult<string>>;
}
