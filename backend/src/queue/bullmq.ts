import {
  type Job,
  type PostgresPoolConfig,
  Queue,
  Worker as BullWorker,
  type WorkerOptions,
  createPostgresBackend,
} from "bullmq";
import {
  MAX_RUNS,
  RETRY_DELAY_MS,
  giveUpQuizJob,
  processQuizJob,
  reconcileQuizJobs,
} from "../core/jobs";
import type { Deps, MessageState, QuizQueue } from "../core/types";
import { log } from "../observability/events";

// The BullMQ queue carrying quiz jobs from the API to the workers.
export const QUIZ_QUEUE = "quiz-jobs";

// Each message names a `quiz_jobs` row; the row holds the job's status and progress.
type QuizJobMessage = { quizJobId: number };

// Where the queue lives: the app's database, in its own schema.
export type QueueSettings = { databaseUrl: string | undefined; schema: string };

// BullMQ's exponential backoff doubles the delay for each retry, as the retry policy says.
const JOB_OPTIONS = {
  attempts: MAX_RUNS,
  backoff: { type: "exponential", delay: RETRY_DELAY_MS },
  // The quiz_jobs row is the history, so BullMQ only keeps recent jobs for debugging.
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
} as const;

// The BullMQ job id for a row, so sending the same row twice is a no-op.
export const messageIdFor = (quizJobId: number) => `quiz-job-${quizJobId}`;

// Connection options for BullMQ's Postgres backend, which creates its tables on first connect.
function queueConnection({ databaseUrl, schema }: QueueSettings): PostgresPoolConfig {
  if (databaseUrl === undefined) throw new Error("DATABASE_URL is required for the quiz queue.");
  // `?schema=` is Prisma's; BullMQ takes its schema separately.
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return { connectionString: url.href, schema, migrate: true, max: 5 };
}

// Builds a BullMQ queue on the Postgres backend.
function bullQueue(settings: QueueSettings) {
  return new Queue(
    QUIZ_QUEUE,
    { connection: queueConnection(settings), defaultJobOptions: JOB_OPTIONS },
    createPostgresBackend,
  );
}

export type BullQuizQueue = QuizQueue & {
  // The underlying BullMQ queue, for this adapter's tests.
  bull: ReturnType<typeof bullQueue>;
  close(): Promise<void>;
};

// Sends quiz jobs to the workers through BullMQ.
export function createBullQueue(settings: QueueSettings): BullQuizQueue {
  const bull = bullQueue(settings);
  return {
    bull,
    async send(quizJobId) {
      const message: QuizJobMessage = { quizJobId };
      await bull.add("quiz", message, { jobId: messageIdFor(quizJobId) });
    },
    async stateOf(quizJobId): Promise<MessageState> {
      const state = await bull.getJobState(messageIdFor(quizJobId));
      if (state === "unknown") return "gone";
      if (state === "completed" || state === "failed") return "finished";
      return "waiting";
    },
    close: () => bull.close(),
  };
}

export type Worker = { isRunning(): boolean; stop(): Promise<void> };

type WorkerSettings = {
  queue: QueueSettings;
  concurrency: number;
  // BullMQ timing overrides, for tests.
  bull?: Pick<WorkerOptions, "lockDuration" | "stalledInterval" | "drainDelay">;
};

// Reconciles unfinished jobs, then runs quiz jobs from the queue, up to `concurrency` at once.
export async function startBullWorker(
  deps: Omit<Deps, "queue">,
  { queue: queueSettings, concurrency, bull }: WorkerSettings,
): Promise<Worker> {
  const queue = createBullQueue(queueSettings);
  await reconcileQuizJobs({ ...deps, queue });

  const worker = new BullWorker(
    QUIZ_QUEUE,
    async (job: Job<QuizJobMessage>) =>
      processQuizJob(deps, job.data.quizJobId, {
        // attemptsStarted counts restarts after a stall too, so each delivery gets its own number.
        run: job.attemptsStarted,
        final: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
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
        if (failed) await giveUpQuizJob(deps, job.data.quizJobId);
      })
      .catch(() => {}); // giveUpQuizJob's event records the failure.
  });
  worker.on("error", (error) => log("error", "Quiz worker error", {}, error));

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
