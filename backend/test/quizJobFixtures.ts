import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { QuizDraft } from "@quizqrafter/shared";
import { uploadDocument } from "../src/core/documents";
import type { Deps, QuizQueue } from "../src/core/types";
import { ConsoleEmailSender } from "../src/providers/email/consoleEmailSender";
import { FakeExtractor } from "../src/providers/fake/fakeExtractor";
import { FileBlobStore } from "../src/providers/fake/fileBlobStore";
import type { QuizGenerator } from "../src/providers/types";
import { testDatabaseUrl } from "./testDatabase";

// Shared setup for the quiz job tests: the database, a file store, and stub quiz writers.
export const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
export const blobDir = mkdtempSync(path.join(tmpdir(), "quizqrafter-jobs-"));
const blobs = new FileBlobStore(blobDir);

export const QUIZ: QuizDraft = {
  title: "Stub quiz",
  questions: [
    { type: "true_false", prompt: "Q1", answer: true, explanation: "", sourceQuote: null },
    { type: "true_false", prompt: "Q2", answer: false, explanation: "", sourceQuote: null },
  ],
};

// Deps on `queue` whose generator behaves as `generate` says.
export function depsWith(queue: QuizQueue, generate: QuizGenerator["generate"]): Deps {
  return {
    prisma,
    queue,
    providers: {
      blobs,
      email: new ConsoleEmailSender(),
      extractor: new FakeExtractor(),
      generator: { generate },
    },
  };
}

// A generator that reports progress and writes `quiz`.
export const writes =
  (quiz: QuizDraft = QUIZ): QuizGenerator["generate"] =>
  async (_text, onProgress) => {
    onProgress?.(1);
    onProgress?.(2);
    return quiz;
  };

export async function newUser() {
  return prisma.user.create({ data: { email: `jobs-${randomUUID()}@example.com`, name: "Jobs" } });
}

// Uploads a text file for the user, which starts its quiz job.
export async function upload(deps: Deps, userId: number, filename = "notes.txt") {
  const { document, job } = await uploadDocument(deps, userId, {
    filename,
    content: Buffer.from("Some notes."),
    size: 11,
    mimeType: "text/plain",
  });
  return { documentId: document.id, jobId: job.id };
}

// Creates a user with one uploaded document, which starts a job.
export async function userWithDocument(deps: Deps) {
  const user = await newUser();
  return { userId: user.id, ...(await upload(deps, user.id)) };
}

export const jobRow = (id: number) => prisma.quizJob.findUniqueOrThrow({ where: { id } });

// Waits until `check` passes, for work done in the background.
export async function eventually<T>(check: () => Promise<T>, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
