import { type Job, Worker as BullWorker, type WorkerOptions, createPostgresBackend } from "bullmq";
import {
  type QueueSettings,
  type QuizJobMessage,
  QUIZ_QUEUE,
  createQuizQueue,
  messageIdFor,
  queueConnection,
} from "../queue";
import { ACTIVE, failQuizJob, runQuizJob } from "./jobs";
import type { Deps } from "./types";

export type Worker = { isRunning(): boolean; stop(): Promise<void> };

type WorkerSettings = {
  queue: QueueSettings;
  concurrency: number;
  // BullMQ timing overrides, for tests.
  bull?: Pick<WorkerOptions, "lockDuration" | "stalledInterval" | "drainDelay">;
};

// Takes quiz jobs from the BullMQ queue and runs up to `concurrency` at once.
export async function startWorker(
  deps: Omit<Deps, "queue">,
  { queue: queueSettings, concurrency, bull }: WorkerSettings,
): Promise<Worker> {
  const queue = createQuizQueue(queueSettings);
  await reconcileQuizJobs({ ...deps, queue });

  const worker = new BullWorker(
    QUIZ_QUEUE,
    async (job: Job<QuizJobMessage>) =>
      runQuizJob({ ...deps, queue }, job.data.quizJobId, {
        claim: job.attemptsStarted,
        lastAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      }),
    { connection: queueConnection(queueSettings), concurrency, ...bull },
    createPostgresBackend,
  );

  // A retry is also reported as "failed", so only act once BullMQ has given up on the job.
  worker.on("failed", (job) => {
    if (job === undefined) return;
    void job
      .isFailed()
      .then(async (failed) => {
        if (failed) await failQuizJob(deps.prisma, job.data.quizJobId);
      })
      .catch((error) => console.error("Recording a failed quiz job failed:", error));
  });
  worker.on("error", (error) => console.error("Quiz worker error:", error));

  await worker.waitUntilReady();
  return {
    isRunning: () => worker.isRunning(),
    // Waits for running jobs to finish, then disconnects.
    async stop() {
      await worker.close();
      await queue.close();
    },
  };
}

// Matches unfinished rows to their queue messages: re-sends rows whose message is missing
// (e.g. the API stopped between saving the row and sending it) and fails rows BullMQ gave up on.
export async function reconcileQuizJobs({
  prisma,
  queue,
}: Pick<Deps, "prisma"> & {
  queue: ReturnType<typeof createQuizQueue>;
}): Promise<void> {
  const rows = await prisma.quizJob.findMany({
    where: { status: { in: ACTIVE } },
    select: { id: true },
  });
  for (const { id } of rows) {
    const state = await queue.bull.getJobState(messageIdFor(id));
    if (state === "unknown") await queue.add(id);
    else if (state === "failed" || state === "completed") await failQuizJob(prisma, id);
  }
}
