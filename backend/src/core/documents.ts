import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { type Document, type GenerateQuizJob, uploadTypeFor } from "@quizqrafter/shared";
import { readLocally } from "./documentReader";
import { assertCanStartJob, startGenerateQuizJob, toGenerateQuizJob } from "./jobs";
import { annotate } from "../observability/events";
import { type Deps, NotFoundError, UnsupportedFileError } from "./types";

const withQuizAndLatestJob = {
  quiz: { select: { id: true } },
  jobs: { orderBy: { createdAt: "desc" }, take: 1 },
} as const;

type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof withQuizAndLatestJob }>;

function toDocument(row: DocumentRow): Document {
  const quizId = row.quiz?.id ?? null;
  const latestJob = row.jobs[0];
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    quizId,
    latestJob: latestJob ? toGenerateQuizJob(latestJob, quizId) : null,
  };
}

export type UploadedFile = {
  filename: string;
  content: Buffer;
  size: number;
  mimeType: string;
};

// Stores the file and queues a job to read it and write its quiz.
export async function uploadDocument(
  deps: Deps,
  userId: number,
  file: UploadedFile,
): Promise<{ document: Document; job: GenerateQuizJob }> {
  const { prisma, providers } = deps;
  const mimeType = uploadTypeFor(file.mimeType, file.filename);
  if (mimeType === null) throw new UnsupportedFileError();
  // Refuse before storing anything if we can; starting the job below is what enforces the limit.
  await assertCanStartJob(prisma, userId);

  // The random part keeps two uploads with the same filename from overwriting each other.
  const rawURL = await providers.blobs.put(
    `u${userId}/${randomUUID()}-${file.filename}`,
    file.content,
  );

  let job: GenerateQuizJob;
  try {
    job = await startGenerateQuizJob(deps, userId, {
      newDocument: { filename: file.filename, mimeType, size: file.size, rawURL },
    });
  } catch (error) {
    // No document refers to the file, e.g. a concurrent upload took the last slot.
    await providers.blobs
      .delete(rawURL)
      .catch(() => annotate({ "app.document.orphaned_file": true }));
    throw error;
  }
  const row = await prisma.document.findUniqueOrThrow({
    where: { id: job.documentId },
    include: withQuizAndLatestJob,
  });
  return { document: toDocument(row), job };
}

// Lists a user's documents, newest first, each with its latest GenerateQuizJob.
export async function listDocuments({ prisma }: Deps, userId: number): Promise<Document[]> {
  const rows = await prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: withQuizAndLatestJob,
  });
  return rows.map(toDocument);
}

// One of the user's documents with its original file, for viewing.
export async function getDocumentFile(
  { prisma, providers }: Deps,
  userId: number,
  id: number,
): Promise<{ filename: string; mimeType: string; content: Buffer }> {
  const row = await prisma.document.findFirst({ where: { id, userId } });
  if (row === null) throw new NotFoundError("Document");
  const content = await providers.blobs.get(row.rawURL);
  return { filename: row.filename, mimeType: row.mimeType, content };
}

// A Word document's text, for viewing; browsers can't show .docx files themselves.
export async function getDocumentText(deps: Deps, userId: number, id: number): Promise<string> {
  const { mimeType, content } = await getDocumentFile(deps, userId, id);
  const text = await readLocally(content, mimeType);
  if (text === null) throw new UnsupportedFileError();
  return text;
}
