import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { QuizDraft } from "@quizqrafter/shared";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { uploadDocument } from "../src/core/documents";
import { MAX_ACTIVE_JOBS_PER_USER, enqueueQuizJob, runQuizJob } from "../src/core/jobs";
import { type Deps, NotFoundError, TooManyJobsError } from "../src/core/types";
import { type Worker, startWorker } from "../src/core/worker";
import { createQuizQueue, messageIdFor } from "../src/queue";
import { PermanentJobError } from "../src/providers/errors";
import { ConsoleEmailSender } from "../src/providers/email/consoleEmailSender";
import { FakeExtractor } from "../src/providers/fake/fakeExtractor";
import { FileBlobStore } from "../src/providers/fake/fileBlobStore";
import type { QuizGenerator } from "../src/providers/types";
import { testDatabaseUrl, testQueueSettings } from "./testDatabase";

const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
const blobs = new FileBlobStore(mkdtempSync(path.join(tmpdir(), "quizqrafter-jobs-")));

const QUIZ: QuizDraft = {
  title: "Stub quiz",
  questions: [
    { type: "true_false", prompt: "Q1", answer: true, explanation: "", sourceQuote: null },
    { type: "true_false", prompt: "Q2", answer: false, explanation: "", sourceQuote: null },
  ],
};

// The real BullMQ queue, on the test schema.
const queue = createQuizQueue(testQueueSettings());

// Deps whose generator behaves as `generate` says.
function depsWith(generate: QuizGenerator["generate"]): Deps {
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
const message = (id: number) => queue.bull.getJob(messageIdFor(id));

// Waits until `check` passes, for work done by a worker.
async function eventually<T>(check: () => Promise<T>, timeoutMs = 10_000): Promise<T> {
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

let worker: Worker | null = null;

// Starts a BullMQ worker on the test queue that runs jobs with `deps`.
async function startTestWorker(deps: Deps, concurrency = 2) {
  worker = await startWorker(deps, {
    queue: testQueueSettings(),
    concurrency,
    bull: { drainDelay: 1 },
  });
  return worker;
}

beforeEach(async () => {
  await queue.bull.obliterate({ force: true });
  await prisma.quizJob.deleteMany();
});

afterEach(async () => {
  await worker?.stop();
  worker = null;
});

afterAll(async () => {
  // Leave no queued jobs behind for other suites (such as e2e) whose worker would pick them up.
  await queue.bull.obliterate({ force: true });
  await queue.close();
  await prisma.quizJob.deleteMany();
  await prisma.$disconnect();
});

describe("running a job", () => {
  const first = { claim: 1, lastAttempt: false };

  it("reads the document, writes the quiz and records progress", async () => {
    const { jobId, documentId } = await userWithDocument();
    await runQuizJob(succeeding, jobId, first);

    expect(await jobRow(jobId)).toMatchObject({
      status: "succeeded",
      stage: null,
      questionsWritten: 2,
      error: null,
      attempts: 1,
    });
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { quiz: { include: { questions: true } } },
    });
    expect(document.transcriptionURL).not.toBeNull();
    expect(document.quiz?.questions).toHaveLength(2);
  });

  it("puts a transient failure back in the queue and throws, so BullMQ retries it", async () => {
    const flaky = depsWith(async () => {
      throw new Error("503 overloaded");
    });
    const { jobId } = await userWithDocument(flaky);
    await expect(runQuizJob(flaky, jobId, first)).rejects.toThrow("503 overloaded");
    expect(await jobRow(jobId)).toMatchObject({ status: "queued", error: null });
  });

  it("fails a transient failure on the last attempt with a generic message", async () => {
    const flaky = depsWith(async () => {
      throw new Error("503 overloaded");
    });
    const { jobId } = await userWithDocument(flaky);
    await runQuizJob(flaky, jobId, { claim: 3, lastAttempt: true });
    const row = await jobRow(jobId);
    expect(row).toMatchObject({ status: "failed", attempts: 3 });
    // The user sees a generic message, not the provider's error.
    expect(row.error).toMatch(/something went wrong/i);
  });

  it("fails a permanent error at once with its message", async () => {
    const refused = depsWith(async () => {
      throw new PermanentJobError("The AI declined to write a quiz from this document.");
    });
    const { jobId } = await userWithDocument(refused);
    await runQuizJob(refused, jobId, first);
    expect(await jobRow(jobId)).toMatchObject({
      status: "failed",
      error: "The AI declined to write a quiz from this document.",
    });
  });

  it("ignores an old run once a newer run has claimed the job", async () => {
    let releaseOld!: () => void;
    const slow = depsWith(async () => {
      await new Promise<void>((resolve) => (releaseOld = resolve));
      return QUIZ;
    });
    const { jobId, documentId } = await userWithDocument(slow);
    const oldRun = runQuizJob(slow, jobId, first);
    await eventually(async () => expect((await jobRow(jobId)).stage).toBe("writing"));

    // BullMQ restarted the stalled job elsewhere, and that run failed for good.
    const refused = depsWith(async () => {
      throw new PermanentJobError("Refused.");
    });
    await runQuizJob(refused, jobId, { claim: 2, lastAttempt: false });

    releaseOld();
    await oldRun;
    expect(await jobRow(jobId)).toMatchObject({ status: "failed", error: "Refused." });
    expect(await prisma.quiz.count({ where: { documentId } })).toBe(0);
  });
});

describe("the BullMQ worker", () => {
  it("runs an uploaded document's job", async () => {
    await startTestWorker(succeeding);
    const { jobId } = await userWithDocument();
    await eventually(async () =>
      expect(await jobRow(jobId)).toMatchObject({ status: "succeeded" }),
    );
  });

  it("runs jobs side by side up to its concurrency", async () => {
    let running = 0;
    let most = 0;
    const counting = depsWith(async () => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 300));
      running--;
      return QUIZ;
    });
    await startTestWorker(counting, 2);
    const jobs = [await userWithDocument(), await userWithDocument(), await userWithDocument()];
    for (const { jobId } of jobs) {
      await eventually(async () => expect((await jobRow(jobId)).status).toBe("succeeded"));
    }
    expect(most).toBe(2);
  });

  it("retries a transient failure after a 30 s backoff", async () => {
    let calls = 0;
    const flakyOnce = depsWith(async () => {
      if (++calls === 1) throw new Error("503 overloaded");
      return QUIZ;
    });
    await startTestWorker(flakyOnce);
    const { jobId } = await userWithDocument(flakyOnce);

    const job = await eventually(async () => {
      const job = await message(jobId);
      expect(await job?.getState()).toBe("delayed");
      return job!;
    });
    expect(job.attemptsMade).toBe(1);
    expect(job.delay).toBe(30_000);
    expect((await jobRow(jobId)).status).toBe("queued");

    await job.promote(); // Skip the wait.
    await eventually(async () =>
      expect(await jobRow(jobId)).toMatchObject({ status: "succeeded", attempts: 2 }),
    );
  });

  it("does not retry a permanent failure", async () => {
    let calls = 0;
    const refused = depsWith(async () => {
      calls++;
      throw new PermanentJobError("Refused.");
    });
    await startTestWorker(refused);
    const { jobId } = await userWithDocument(refused);
    await eventually(async () => expect((await jobRow(jobId)).status).toBe("failed"));
    expect(calls).toBe(1);
  });

  it("sends queued jobs that have no message when it starts", async () => {
    const { jobId } = await userWithDocument();
    // As if the API stopped between saving the row and sending the message.
    await queue.bull.obliterate({ force: true });
    await startTestWorker(succeeding);
    await eventually(async () => expect((await jobRow(jobId)).status).toBe("succeeded"));
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
    // The refused upload isn't kept as a document without a quiz.
    expect(await prisma.document.count({ where: { userId } })).toBe(MAX_ACTIVE_JOBS_PER_USER);
  });

  it("sends the job to the queue", async () => {
    const { jobId } = await userWithDocument();
    expect((await message(jobId))?.data).toEqual({ quizJobId: jobId });
  });

  it("fails the job if the queue can't take it, so it isn't stuck waiting", async () => {
    const broken: Deps = {
      ...succeeding,
      queue: {
        add: async () => {
          throw new Error("queue down");
        },
      },
    };
    const { jobId } = await userWithDocument(broken);
    expect(await jobRow(jobId)).toMatchObject({ status: "failed" });
    expect((await jobRow(jobId)).error).toMatch(/couldn't be started/);
  });

  it("refuses to queue a job for another user's document", async () => {
    const { documentId } = await userWithDocument();
    const other = await userWithDocument();
    await expect(enqueueQuizJob(succeeding, other.userId, documentId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
