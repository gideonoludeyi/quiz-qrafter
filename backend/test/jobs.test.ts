import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { QuizDraft } from "@quizqrafter/shared";
import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { uploadDocument } from "../src/core/documents";
import {
  MAX_ACTIVE_JOBS_PER_USER,
  RETRY_DELAYS_MS,
  STALE_AFTER_MS,
  claimNextJob,
  enqueueQuizJob,
  recoverStaleJobs,
  runNextJob,
} from "../src/core/jobs";
import { type Deps, NotFoundError, TooManyJobsError } from "../src/core/types";
import { PermanentJobError } from "../src/providers/errors";
import { ConsoleEmailSender } from "../src/providers/email/consoleEmailSender";
import { FakeExtractor } from "../src/providers/fake/fakeExtractor";
import { FileBlobStore } from "../src/providers/fake/fileBlobStore";
import type { QuizGenerator } from "../src/providers/types";
import { testDatabaseUrl } from "./testDatabase";

const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
const blobs = new FileBlobStore(mkdtempSync(path.join(tmpdir(), "quizqrafter-jobs-")));

const QUIZ: QuizDraft = {
  title: "Stub quiz",
  questions: [
    { type: "true_false", prompt: "Q1", answer: true, explanation: "", sourceQuote: null },
    { type: "true_false", prompt: "Q2", answer: false, explanation: "", sourceQuote: null },
  ],
};

// Deps whose generator behaves as `generate` says.
function depsWith(generate: QuizGenerator["generate"]): Deps {
  return {
    prisma,
    providers: {
      blobs,
      email: new ConsoleEmailSender(),
      extractor: new FakeExtractor(),
      generator: { generate },
    },
  };
}

const succeeding = depsWith(async (_text, onProgress) => {
  onProgress?.(1);
  onProgress?.(2);
  return QUIZ;
});

let emailCount = 0;

// Creates a user with one uploaded document, which queues a job.
async function userWithDocument(deps: Deps = succeeding) {
  const user = await prisma.user.create({
    data: { email: `jobs-${++emailCount}@example.com`, name: "Jobs" },
  });
  const { document, job } = await uploadDocument(deps, user.id, {
    filename: "notes.txt",
    content: Buffer.from("Some notes."),
    size: 11,
    mimeType: "text/plain",
  });
  return { userId: user.id, documentId: document.id, jobId: job.id };
}

const jobRow = (id: number) => prisma.quizJob.findUniqueOrThrow({ where: { id } });

// Makes a queued job due now, skipping its retry delay.
const makeDue = (id: number) =>
  prisma.quizJob.update({ where: { id }, data: { runAfter: new Date(Date.now() - 1000) } });

beforeEach(async () => {
  await prisma.quizJob.deleteMany();
});

afterAll(async () => {
  // Leave no queued jobs behind for other suites (such as e2e) whose worker would pick them up.
  await prisma.quizJob.deleteMany();
  await prisma.$disconnect();
});

describe("claiming jobs", () => {
  it("never gives the same job to two workers", async () => {
    const first = await userWithDocument();
    const second = await userWithDocument();

    const claimed = await Promise.all([claimNextJob(prisma), claimNextJob(prisma)]);
    const byId = (a: number | null, b: number | null) => (a ?? 0) - (b ?? 0);
    expect(claimed.sort(byId)).toEqual([first.jobId, second.jobId].sort(byId));
    expect(await claimNextJob(prisma)).toBeNull();

    const row = await jobRow(first.jobId);
    expect(row).toMatchObject({ status: "running", attempts: 1 });
    expect(row.heartbeatAt).not.toBeNull();
  });

  it("does not claim a job before its runAfter time", async () => {
    const { jobId } = await userWithDocument();
    await prisma.quizJob.update({
      where: { id: jobId },
      data: { runAfter: new Date(Date.now() + 60_000) },
    });
    expect(await claimNextJob(prisma)).toBeNull();
  });
});

describe("running jobs", () => {
  it("reads the document, writes the quiz and records progress", async () => {
    const { jobId, documentId } = await userWithDocument();
    expect(await runNextJob(succeeding)).toBe(true);

    expect(await jobRow(jobId)).toMatchObject({
      status: "succeeded",
      stage: null,
      questionsWritten: 2,
      error: null,
    });
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { quiz: { include: { questions: true } } },
    });
    expect(document.transcriptionURL).not.toBeNull();
    expect(document.quiz?.questions).toHaveLength(2);
    expect(await runNextJob(succeeding)).toBe(false);
  });

  it("retries a transient failure with backoff, then fails after 3 attempts", async () => {
    const flaky = depsWith(async () => {
      throw new Error("503 overloaded");
    });
    const { jobId } = await userWithDocument(flaky);

    for (const [index, delay] of RETRY_DELAYS_MS.entries()) {
      const before = Date.now();
      await runNextJob(flaky);
      const row = await jobRow(jobId);
      expect(row).toMatchObject({ status: "queued", attempts: index + 1, error: null });
      expect(row.runAfter.getTime()).toBeGreaterThanOrEqual(before + delay);
      await makeDue(jobId);
    }

    await runNextJob(flaky);
    const row = await jobRow(jobId);
    expect(row).toMatchObject({ status: "failed", attempts: 3 });
    // The user sees a generic message, not the provider's error.
    expect(row.error).toMatch(/something went wrong/i);
  });

  it("fails a permanent error immediately with its message", async () => {
    const refused = depsWith(async () => {
      throw new PermanentJobError("The AI declined to write a quiz from this document.");
    });
    const { jobId } = await userWithDocument(refused);
    await runNextJob(refused);
    expect(await jobRow(jobId)).toMatchObject({
      status: "failed",
      attempts: 1,
      error: "The AI declined to write a quiz from this document.",
    });
  });
});

describe("stale jobs", () => {
  async function staleRunningJob(attempts: number) {
    const { jobId } = await userWithDocument();
    await prisma.quizJob.update({
      where: { id: jobId },
      data: {
        status: "running",
        attempts,
        heartbeatAt: new Date(Date.now() - STALE_AFTER_MS - 1000),
      },
    });
    return jobId;
  }

  it("requeues a running job whose heartbeat stopped", async () => {
    const jobId = await staleRunningJob(1);
    expect(await recoverStaleJobs(prisma)).toBe(1);
    expect(await jobRow(jobId)).toMatchObject({ status: "queued", heartbeatAt: null });
  });

  it("fails a stale job that has used all its attempts", async () => {
    const jobId = await staleRunningJob(3);
    await recoverStaleJobs(prisma);
    expect(await jobRow(jobId)).toMatchObject({ status: "failed" });
  });

  it("leaves running jobs with a recent heartbeat alone", async () => {
    await userWithDocument();
    const jobId = await claimNextJob(prisma);
    expect(await recoverStaleJobs(prisma)).toBe(0);
    expect(await jobRow(jobId!)).toMatchObject({ status: "running" });
  });
});

describe("queueing jobs", () => {
  it("returns the document's active job instead of queueing another", async () => {
    const { userId, documentId, jobId } = await userWithDocument();
    const again = await enqueueQuizJob(succeeding, userId, documentId);
    expect(again.id).toBe(jobId);
    expect(await prisma.quizJob.count({ where: { documentId } })).toBe(1);
  });

  it("limits how many jobs one user can have in progress", async () => {
    const { userId } = await userWithDocument();
    for (let i = 1; i < MAX_ACTIVE_JOBS_PER_USER; i++) {
      await uploadDocument(succeeding, userId, {
        filename: `more-${i}.txt`,
        content: Buffer.from("More notes."),
        size: 11,
        mimeType: "text/plain",
      });
    }
    await expect(
      uploadDocument(succeeding, userId, {
        filename: "one-too-many.txt",
        content: Buffer.from("Too many."),
        size: 9,
        mimeType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(TooManyJobsError);
  });

  it("refuses to queue a job for another user's document", async () => {
    const { documentId } = await userWithDocument();
    const other = await userWithDocument();
    await expect(enqueueQuizJob(succeeding, other.userId, documentId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
