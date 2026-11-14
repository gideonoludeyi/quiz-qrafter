import type { Document, GenerateQuizJob } from "@quizqrafter/shared";

export interface DocumentService {
  // Stores the file and starts the job that reads it and writes its quiz.
  upload(file: File): Promise<{ document: Document; job: GenerateQuizJob }>;
  list(): Promise<Document[]>;
  // The document's original file, for the viewer.
  getFile(id: number): Promise<Blob>;
  // A Word document's text, which the viewer shows in place of the .docx file.
  getText(id: number): Promise<string>;
}
