import { readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  MAX_ACTIVE_JOBS_PER_USER,
  MAX_RUNS,
  reconcileGenerateQuizJobs,
  startGenerateQuizJob,
} from "../src/core/jobs";
import { type Deps, NotFoundError, TooManyJobsError } from "../src/core/types";
import { PermanentJobError } from "../src/providers/errors";
import { GeminiQuizGenerator } from "../src/providers/gemini/quizGenerator";
import { withWideEvent } from "../src/observability/events";
import { createMemoryQueue } from "../src/queue/memory";
import { captureEvents, finishedWith, geminiStreaming, startTestTracing } from "./fixtures";
import {
  QUIZ,
  blobDir,
  depsWith,
  jobRow,
  newUser,
  prisma,
  upload,
  userWithDocument,
  writes,
} from "./generateQuizJobFixtures";

// The GenerateQuizJob module through its interface, with the in-memory queue standing in for BullMQ.
const queue = createMemoryQueue();
const succeeding = depsWith(queue, writes());
const failingWith = (error: Error) =>
  depsWith(queue, async () => {
    throw error;
  });

// A generator that waits until `release` is called, to hold a run mid-way.
function held() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return {
    deps: depsWith(queue, async (...args) => {
      await gate;
      return writes({ ...QUIZ, title: "Old run's quiz" })(...args);
    }),
    release: () => release(),
  };
}

const activeJobs = (userId: number) =>
  prisma.generateQuizJob.count({
    where: { status: { in: ["queued", "running"] }, document: { userId } },
  });

beforeEach(async () => {
  await prisma.generateQuizJob.deleteMany();
});

afterAll(async () => {
  await prisma.generateQuizJob.deleteMany();
  await prisma.$disconnect();
});

describe("running a job", () => {
  it("reads the document, writes the quiz and records progress", async () => {
    const { jobId, documentId } = await userWithDocument(succeeding);
    await queue.deliver(succeeding, jobId);

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
    expect(await queue.stateOf(jobId)).toBe("finished");
  });

  it("puts a transient failure back in the queue for a retry", async () => {
    const flaky = failingWith(new Error("503 overloaded"));
    const { jobId } = await userWithDocument(flaky);
    await queue.deliver(flaky, jobId);
    expect(await jobRow(jobId)).toMatchObject({ status: "queued", error: null });
    expect(await queue.stateOf(jobId)).toBe("waiting");
  });

  it("fails a transient failure on the final run with a generic message", async () => {
    const flaky = failingWith(new Error("503 overloaded"));
    const { jobId } = await userWithDocument(flaky);
    for (let i = 0; i < MAX_RUNS; i++) await queue.deliver(flaky, jobId);

    const row = await jobRow(jobId);
    expect(row).toMatchObject({ status: "failed", attempts: MAX_RUNS });
    // The user sees a generic message, not the provider's error.
    expect(row.error).toMatch(/something went wrong/i);
  });

  it("fails a permanent error at once with its message", async () => {
    const refused = failingWith(
      new PermanentJobError("The AI declined to write a quiz from this document."),
    );
    const { jobId } = await userWithDocument(refused);
    await queue.deliver(refused, jobId);
    expect(await jobRow(jobId)).toMatchObject({
      status: "failed",
      error: "The AI declined to write a quiz from this document.",
    });
    expect(await queue.stateOf(jobId)).toBe("finished");
  });

  it("ignores an old run once a newer run has taken the job over", async () => {
    const old = held();
    const { jobId, documentId } = await userWithDocument(old.deps);
    const oldRun = queue.deliver(old.deps, jobId);
    await expect.poll(async () => (await jobRow(jobId)).stage).toBe("writing");

    // The old run stalled, and the run that took over failed for good.
    await queue.deliver(failingWith(new PermanentJobError("Refused.")), jobId);

    old.release();
    await oldRun;
    expect(await jobRow(jobId)).toMatchObject({ status: "failed", error: "Refused." });
    expect(await prisma.quiz.count({ where: { documentId } })).toBe(0);
  });

  it("keeps only the newer run's quiz when an old run finishes late", async () => {
    const old = held();
    const { jobId, documentId } = await userWithDocument(old.deps);
    const oldRun = queue.deliver(old.deps, jobId);
    await expect.poll(async () => (await jobRow(jobId)).stage).toBe("writing");

    await queue.deliver(succeeding, jobId);
    old.release();
    await oldRun;

    expect(await jobRow(jobId)).toMatchObject({ status: "succeeded", attempts: 2 });
    const quiz = await prisma.quiz.findUniqueOrThrow({ where: { documentId } });
    expect(quiz.title).toBe(QUIZ.title);
  });
});

describe("a run's wide event", () => {
  it("says why Gemini refused, and that a retry won't help", async () => {
    const gemini = new GeminiQuizGenerator(geminiStreaming(finishedWith("RECITATION")), "m");
    const refused = depsWith(queue, (text, onProgress) => gemini.generate(text, onProgress));
    const { userId, documentId, jobId } = await userWithDocument(refused);

    const events = captureEvents();
    await queue.deliver(refused, jobId);
    events.stop();

    expect(events.named("job.run")).toEqual([
      expect.objectContaining({
        level: "error",
        "app.job.id": jobId,
        "app.job.kind": "generate_quiz",
        "app.job.run": 1,
        "app.job.final": false,
        "app.generate_quiz.stage": "writing",
        "app.job.outcome": "failed",
        "app.user.id": userId,
        "app.document.id": documentId,
        "app.ai.finish_reason": "RECITATION",
        "error.type": "RecitationError",
        "app.error.retriable": false,
      }),
    ]);
  });

  it("marks a transient failure as retrying", async () => {
    const { jobId } = await userWithDocument(succeeding);
    const events = captureEvents();
    await queue.deliver(failingWith(new Error("503 overloaded")), jobId);
    events.stop();
    expect(events.named("job.run")[0]).toMatchObject({
      "app.job.outcome": "retrying",
      "app.error.retriable": true,
      "exception.message": "503 overloaded",
    });
  });
});

describe("a run's trace", () => {
  it("continues the trace of the request that started the job", async () => {
    const tracing = startTestTracing();
    try {
      const { id: userId } = await newUser();
      const { jobId } = await withWideEvent("http.request", {}, () => upload(succeeding, userId));
      await queue.deliver(succeeding, jobId);

      const [request] = tracing.spans("http.request");
      const [run] = tracing.spans("job.run");
      expect(run.spanContext().traceId).toBe(request.spanContext().traceId);
      expect(run.parentSpanContext?.spanId).toBe(request.spanContext().spanId);
      expect(run.attributes).toMatchObject({ "app.job.id": jobId, "app.job.outcome": "succeeded" });
    } finally {
      await tracing.stop();
    }
  });
});

describe("starting jobs", () => {
  it("returns the document's active job instead of starting another", async () => {
    const { userId, documentId, jobId } = await userWithDocument(succeeding);
    const again = await startGenerateQuizJob(succeeding, userId, documentId);
    expect(again.id).toBe(jobId);
    expect(await prisma.generateQuizJob.count({ where: { documentId } })).toBe(1);
  });

  it("limits how many jobs one user can have in progress", async () => {
    const { userId } = await userWithDocument(succeeding);
    for (let i = 1; i < MAX_ACTIVE_JOBS_PER_USER; i++) {
      await upload(succeeding, userId, `more-${i}.txt`);
    }
    await expect(upload(succeeding, userId, "one-too-many.txt")).rejects.toBeInstanceOf(
      TooManyJobsError,
    );
    // The refused upload isn't kept as a document without a quiz.
    expect(await prisma.document.count({ where: { userId } })).toBe(MAX_ACTIVE_JOBS_PER_USER);
  });

  it("holds the limit when one user starts several jobs at once", async () => {
    const { id: userId } = await newUser();
    const documents = await Promise.all(
      Array.from({ length: MAX_ACTIVE_JOBS_PER_USER + 2 }, (_, i) =>
        prisma.document.create({
          data: { filename: `${i}.txt`, mimeType: "text/plain", size: 1, rawURL: "x", userId },
        }),
      ),
    );

    const results = await Promise.allSettled(
      documents.map(({ id }) => startGenerateQuizJob(succeeding, userId, id)),
    );

    const refused = results.filter((result) => result.status === "rejected");
    expect(refused).toHaveLength(2);
    for (const result of refused) expect(result.reason).toBeInstanceOf(TooManyJobsError);
    expect(await activeJobs(userId)).toBe(MAX_ACTIVE_JOBS_PER_USER);
  });

  it("deletes the files of uploads refused at once over the limit", async () => {
    const { id: userId } = await newUser();
    const results = await Promise.allSettled(
      Array.from({ length: MAX_ACTIVE_JOBS_PER_USER + 2 }, (_, i) =>
        upload(succeeding, userId, `${i}.txt`),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      MAX_ACTIVE_JOBS_PER_USER,
    );
    expect(await prisma.document.count({ where: { userId } })).toBe(MAX_ACTIVE_JOBS_PER_USER);
    expect(readdirSync(path.join(blobDir, `u${userId}`))).toHaveLength(MAX_ACTIVE_JOBS_PER_USER);
  });

  it("sends the job to the queue", async () => {
    const { jobId } = await userWithDocument(succeeding);
    expect(await queue.stateOf(jobId)).toBe("waiting");
  });

  it("fails the job if the queue can't take it, so it isn't stuck waiting", async () => {
    const broken: Deps = {
      ...succeeding,
      queue: {
        ...queue,
        send: async () => {
          throw new Error("queue down");
        },
      },
    };
    const { jobId } = await userWithDocument(broken);
    expect(await jobRow(jobId)).toMatchObject({ status: "failed" });
    expect((await jobRow(jobId)).error).toMatch(/couldn't be started/);
  });

  it("refuses to start a job for another user's document", async () => {
    const { documentId } = await userWithDocument(succeeding);
    const other = await newUser();
    await expect(startGenerateQuizJob(succeeding, other.id, documentId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("reconciling jobs", () => {
  it("re-sends an unfinished job whose message was lost", async () => {
    const { jobId } = await userWithDocument(succeeding);
    queue.lose(jobId);
    await reconcileGenerateQuizJobs(succeeding);
    expect(await queue.stateOf(jobId)).toBe("waiting");
  });

  it("fails an unfinished job the queue is done with", async () => {
    const { jobId } = await userWithDocument(succeeding);
    await queue.deliver(succeeding, jobId);
    // As if the worker died before recording the outcome.
    await prisma.generateQuizJob.update({ where: { id: jobId }, data: { status: "running" } });

    await reconcileGenerateQuizJobs(succeeding);
    expect((await jobRow(jobId)).status).toBe("failed");
  });
});
