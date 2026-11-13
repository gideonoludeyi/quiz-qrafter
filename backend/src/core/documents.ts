import { randomUUID } from "node:crypto";
import type { Document } from "@quizqrafter/shared";
import type { Deps } from "./types";

type DocumentRow = {
  id: number;
  filename: string;
  size: number;
  createdAt: Date;
  quiz: { id: number } | null;
};

function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    filename: row.filename,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    quizId: row.quiz?.id ?? null,
  };
}

export type UploadedFile = {
  filename: string;
  content: Buffer;
  size: number;
  mimeType: string;
};

// Extracts the file's text, stores the file and its transcript, and records the document.
export async function uploadDocument(
  { prisma, providers }: Deps,
  userId: number,
  file: UploadedFile,
): Promise<Document> {
  const text = await providers.extractor.extract(file.content, file.mimeType);

  // The random part keeps two uploads with the same filename from overwriting each other.
  const key = `u${userId}/${randomUUID()}-${file.filename}`;
  const [rawURL, transcriptionURL] = await Promise.all([
    providers.blobs.put(key, file.content),
    providers.blobs.put(`${key}.transcript`, text),
  ]);

  const row = await prisma.document.create({
    data: { filename: file.filename, size: file.size, rawURL, transcriptionURL, userId },
    include: { quiz: { select: { id: true } } },
  });
  return toDocument(row);
}

// Lists a user's documents, newest first.
export async function listDocuments({ prisma }: Deps, userId: number): Promise<Document[]> {
  const rows = await prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { quiz: { select: { id: true } } },
  });
  return rows.map(toDocument);
}
