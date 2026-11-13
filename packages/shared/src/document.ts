import { z } from "zod";

export const DocumentSchema = z.object({
  id: z.number().int(),
  filename: z.string(),
  size: z.number().int(),
  createdAt: z.string(),
  // Set once a quiz has been generated for this document.
  quizId: z.number().int().nullable(),
});

export const UploadDocumentResponseSchema = z.object({ document: DocumentSchema });
export const ListDocumentsResponseSchema = z.object({ documents: z.array(DocumentSchema) });

export type Document = z.infer<typeof DocumentSchema>;
