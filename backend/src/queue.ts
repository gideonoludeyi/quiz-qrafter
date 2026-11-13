import { Queue, createPostgresBackend, type PostgresPoolConfig } from "bullmq";

// The BullMQ queue carrying quiz jobs from the API to the workers.
export const QUIZ_QUEUE = "quiz-jobs";

// Each message names a `quiz_jobs` row; the row holds the job's status and progress.
export type QuizJobMessage = { quizJobId: number };

// Where the queue lives: the app's database, in its own schema.
export type QueueSettings = { databaseUrl: string | undefined; schema: string };

export const MAX_ATTEMPTS = 3;

// Retries wait 30 s, then 60 s.
const JOB_OPTIONS = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: "exponential", delay: 30_000 },
  // The quiz_jobs row is the history, so BullMQ only keeps recent jobs for debugging.
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
} as const;

// The BullMQ job id for a row, so adding the same row twice is a no-op.
export const messageIdFor = (quizJobId: number) => `quiz-job-${quizJobId}`;

// Connection options for BullMQ's Postgres backend, which creates its tables on first connect.
export function queueConnection({ databaseUrl, schema }: QueueSettings): PostgresPoolConfig {
  if (databaseUrl === undefined) throw new Error("DATABASE_URL is required for the quiz queue.");
  // `?schema=` is Prisma's; BullMQ takes its schema separately.
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return { connectionString: url.href, schema, migrate: true, max: 5 };
}

// What the API needs from the queue: a way to send a row to the workers.
export type QuizQueue = {
  add(quizJobId: number): Promise<void>;
  close(): Promise<void>;
};

// Builds a BullMQ queue on the Postgres backend.
function bullQueue(settings: QueueSettings) {
  return new Queue(
    QUIZ_QUEUE,
    { connection: queueConnection(settings), defaultJobOptions: JOB_OPTIONS },
    createPostgresBackend,
  );
}

export function createQuizQueue(settings: QueueSettings): QuizQueue & {
  bull: ReturnType<typeof bullQueue>;
} {
  const bull = bullQueue(settings);
  return {
    bull,
    async add(quizJobId) {
      const message: QuizJobMessage = { quizJobId };
      await bull.add("quiz", message, { jobId: messageIdFor(quizJobId) });
    },
    close: () => bull.close(),
  };
}
