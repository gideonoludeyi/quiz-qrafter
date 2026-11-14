import { afterAll, afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { Deps } from "../src/core/types";
import { PermanentJobError } from "../src/providers/errors";
import { type Worker, createBullQueue, messageIdFor, startBullWorker } from "../src/queue/bullmq";
import {
  QUIZ,
  depsWith,
  eventually,
  jobRow,
  newUser,
  prisma,
  upload,
  userWithDocument,
  writes,
} from "./generateQuizJobFixtures";
import { startTestTracing } from "./fixtures";
import { withWideEvent } from "../src/observability/events";
import { testQueueSettings } from "./testDatabase";

// The BullMQ adapter against real BullMQ on the test schema.
const queue = createBullQueue(testQueueSettings());
const succeeding = depsWith(queue, writes());
const message = (id: number) => queue.bull.getJob(messageIdFor(id));

let worker: Worker | null = null;

// Starts a BullMQ worker on the test queue that runs jobs with `deps`.
async function startTestWorker(deps: Deps, concurrency = 2) {
  worker = await startBullWorker(deps, {
    queue: testQueueSettings(),
    concurrency,
    bull: { drainDelay: 1 },
  });
  return worker;
}

beforeEach(async () => {
  await queue.bull.obliterate({ force: true });
  await prisma.generateQuizJob.deleteMany();
});

afterEach(async () => {
  await worker?.stop();
  worker = null;
});

afterAll(async () => {
  // Leave no queued jobs behind for other suites (such as e2e) whose worker would pick them up.
  await queue.bull.obliterate({ force: true });
  await queue.close();
  await prisma.generateQuizJob.deleteMany();
  await prisma.$disconnect();
});

describe("the BullMQ queue", () => {
  it("sends a job once, however often it is sent", async () => {
    const { jobId } = await userWithDocument(succeeding);
    await queue.send(jobId);
    expect((await message(jobId))?.data).toMatchObject({ generateQuizJobId: jobId });
    expect(await queue.bull.getJobCounts("waiting")).toEqual({ waiting: 1 });
  });

  it("reports where a job's message is", async () => {
    const { jobId } = await userWithDocument(succeeding);
    expect(await queue.stateOf(jobId)).toBe("waiting");
    await queue.bull.obliterate({ force: true });
    expect(await queue.stateOf(jobId)).toBe("gone");
  });
});

describe("the BullMQ worker", () => {
  it("runs an uploaded document's job", async () => {
    await startTestWorker(succeeding);
    const { jobId } = await userWithDocument(succeeding);
    await eventually(async () =>
      expect(await jobRow(jobId)).toMatchObject({ status: "succeeded", attempts: 1 }),
    );
    expect(await queue.stateOf(jobId)).toBe("finished");
  });

  it("carries the trace through the queue, so a Run is a child of its request", async () => {
    const tracing = startTestTracing();
    try {
      await startTestWorker(succeeding);
      const { id: userId } = await newUser();
      const { jobId } = await withWideEvent("http.request", {}, () => upload(succeeding, userId));
      await eventually(async () => expect((await jobRow(jobId)).status).toBe("succeeded"));

      const [request] = tracing.spans("http.request");
      const run = await eventually(async () => {
        const [span] = tracing.spans("job.run");
        expect(span).toBeDefined();
        return span;
      });
      expect(run.spanContext().traceId).toBe(request.spanContext().traceId);
      expect(run.parentSpanContext?.spanId).toBe(request.spanContext().spanId);
    } finally {
      await tracing.stop();
    }
  });

  it("runs jobs side by side up to its concurrency", async () => {
    let running = 0;
    let most = 0;
    const counting = depsWith(queue, async () => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 300));
      running--;
      return QUIZ;
    });
    await startTestWorker(counting, 2);
    const jobs = [
      await userWithDocument(succeeding),
      await userWithDocument(succeeding),
      await userWithDocument(succeeding),
    ];
    for (const { jobId } of jobs) {
      await eventually(async () => expect((await jobRow(jobId)).status).toBe("succeeded"));
    }
    expect(most).toBe(2);
  });

  it("retries a transient failure after a 30 s backoff", async () => {
    let calls = 0;
    const flakyOnce = depsWith(queue, async () => {
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
    const refused = depsWith(queue, async () => {
      calls++;
      throw new PermanentJobError("errors.jobs.aiDeclinedWriting");
    });
    await startTestWorker(refused);
    const { jobId } = await userWithDocument(refused);
    await eventually(async () => expect((await jobRow(jobId)).status).toBe("failed"));
    expect(calls).toBe(1);
  });

  it("sends queued jobs that have no message when it starts", async () => {
    const { jobId } = await userWithDocument(succeeding);
    // As if the API stopped between saving the row and sending the message.
    await queue.bull.obliterate({ force: true });
    await startTestWorker(succeeding);
    await eventually(async () => expect((await jobRow(jobId)).status).toBe("succeeded"));
  });
});
