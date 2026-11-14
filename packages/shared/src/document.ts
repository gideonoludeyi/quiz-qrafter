import { z } from "zod";
import { GenerateQuizJobSchema } from "./job";

// File types users can upload, with the extensions the file picker offers.
export const ALLOWED_UPLOAD_TYPES = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
} as const satisfies Record<string, readonly string[]>;

export type UploadMimeType = keyof typeof ALLOWED_UPLOAD_TYPES;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// The upload type for a file, or null if it isn't allowed. Browsers often send
// markdown and other files as application/octet-stream, so fall back to the extension.
export function uploadTypeFor(mimeType: string, filename: string): UploadMimeType | null {
  if (Object.hasOwn(ALLOWED_UPLOAD_TYPES, mimeType)) return mimeType as UploadMimeType;
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  for (const [type, extensions] of Object.entries(ALLOWED_UPLOAD_TYPES)) {
    if ((extensions as readonly string[]).includes(extension)) return type as UploadMimeType;
  }
  return null;
}

export const DocumentSchema = z.object({
  id: z.number().int(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  createdAt: z.string(),
  // Set once a quiz has been generated for this document.
  quizId: z.number().int().nullable(),
  // The most recent GenerateQuizJob for this document, if any.
  latestJob: GenerateQuizJobSchema.nullable(),
});

export const UploadDocumentResponseSchema = z.object({
  document: DocumentSchema,
  job: GenerateQuizJobSchema,
});
export const ListDocumentsResponseSchema = z.object({ documents: z.array(DocumentSchema) });

export type Document = z.infer<typeof DocumentSchema>;
