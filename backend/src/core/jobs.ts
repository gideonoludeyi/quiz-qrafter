import { Prisma, type PrismaClient, type JobStage, type QuizJob as JobRow } from "@prisma/client";
import type { QuizJob } from "@quizqrafter/shared";
import { PermanentJobError } from "../providers/errors";
import { saveGeneratedQuiz } from "./quizzes";
import { type Deps, NotFoundError, TooManyJobsError } from "./types";

export const MAX_ATTEMPTS = 3;
export const MAX_ACTIVE_JOBS_PER_USER = 3;
// Wait before retry n (after attempt n failed with a transient error).
export const RETRY_DELAYS_MS = [30_000, 60_000];
export const HEARTBEAT_INTERVAL_MS = 10_000;
// A running job whose heartbeat is older than this has lost its worker.
export const STALE_AFTER_MS = 2 * 60_000;
const PROGRESS_INTERVAL_MS = 1_000;

const GENERIC_FAILURE = "Something went wrong while making your quiz. Please try again.";
const ACTIVE: JobRow["status"][] = ["queued", "running"];

// A time for raw SQL, from the app's clock like every other job timestamp. Mixing in the
// database clock (NOW()) breaks "is it due?" checks when the two clocks differ slightly.
// Casting the ISO string drops its "Z", giving the UTC wall time Prisma stores.
function sqlTime(date: Date) {
  return Prisma.sql`${date.toISOString()}::timestamp(3)`;
}

// Converts a job row to the shared shape. `quizId` is the document's quiz, shown once the job succeeded.
export function toQuizJob(row: JobRow, documentQuizId: number | null): QuizJob {
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status,
    stage: row.stage,
    questionsWritten: row.questionsWritten,
    error: row.error,
    quizId: row.status === "succeeded" ? documentQuizId : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const withDocumentQuiz = { document: { select: { quiz: { select: { id: true } } } } } as const;
type JobWithDocumentQuiz = Prisma.QuizJobGetPayload<{ include: typeof withDocumentQuiz }>;

function toQuizJobWithQuiz(row: JobWithDocumentQuiz): QuizJob {
  return toQuizJob(row, row.document.quiz?.id ?? null);
}

async function findActiveJob(prisma: PrismaClient, documentId: number) {
  return prisma.quizJob.findFirst({
    where: { documentId, status: { in: ACTIVE } },
    include: withDocumentQuiz,
  });
}

// Queues a quiz job for one of the user's documents. Returns the document's job
// already in progress instead of starting a second one.
export async function enqueueQuizJob(
  { prisma }: Deps,
  userId: number,
  documentId: number,
): Promise<QuizJob> {
  const document = await prisma.document.findFirst({ where: { id: documentId, userId } });
  if (document === null) throw new NotFoundError("Document");

  const existing = await findActiveJob(prisma, documentId);
  if (existing !== null) return toQuizJobWithQuiz(existing);

  const active = await prisma.quizJob.count({
    where: { status: { in: ACTIVE }, document: { userId } },
  });
  if (active >= MAX_ACTIVE_JOBS_PER_USER) throw new TooManyJobsError(MAX_ACTIVE_JOBS_PER_USER);

  try {
    const row = await prisma.quizJob.create({
      data: { documentId, runAfter: new Date() },
      include: withDocumentQuiz,
    });
    return toQuizJobWithQuiz(row);
  } catch (error) {
    // A concurrent request queued one first; the partial unique index rejected ours.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await findActiveJob(prisma, documentId);
      if (raced !== null) return toQuizJobWithQuiz(raced);
    }
    throw error;
  }
}

export async function getQuizJob(
  { prisma }: Deps,
  userId: number,
  jobId: number,
): Promise<QuizJob> {
  const row = await prisma.quizJob.findFirst({
    where: { id: jobId, document: { userId } },
    include: withDocumentQuiz,
  });
  if (row === null) throw new NotFoundError("Job");
  return toQuizJobWithQuiz(row);
}

// Marks the oldest due job as running and returns its id, or null if none is due.
// SKIP LOCKED lets several workers claim jobs at once without taking the same one.
export async function claimNextJob(prisma: PrismaClient): Promise<number | null> {
  const now = sqlTime(new Date());
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    UPDATE "quiz_jobs"
    SET "status" = 'running', "attempts" = "attempts" + 1, "stage" = NULL,
        "questionsWritten" = 0, "heartbeatAt" = ${now}, "updatedAt" = ${now}
    WHERE "id" = (
      SELECT "id" FROM "quiz_jobs"
      WHERE "status" = 'queued' AND "runAfter" <= ${now}
      ORDER BY "runAfter", "id"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id"`;
  return rows[0]?.id ?? null;
}

// Writes to a claimed job, but only while this claim still owns it. If the job was
// requeued as stale and claimed again, the old runner's writes are ignored.
function claimWriter(prisma: PrismaClient, jobId: number, attempt: number) {
  return async (data: Prisma.QuizJobUpdateManyMutationInput): Promise<boolean> => {
    const { count } = await prisma.quizJob.updateMany({
      where: { id: jobId, status: "running", attempts: attempt },
      data,
    });
    return count > 0;
  };
}

// Reads the document if needed, writes the quiz, and saves it, recording progress on the job.
export async function runQuizJob(deps: Deps, jobId: number): Promise<void> {
  const { prisma, providers } = deps;
  const job = await prisma.quizJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { document: true },
  });
  const write = claimWriter(prisma, job.id, job.attempts);
  const setStage = (stage: JobStage) => write({ stage, heartbeatAt: new Date() });

  const heartbeat = setInterval(() => {
    void write({ heartbeatAt: new Date() }).catch((error) =>
      console.error("Heartbeat failed:", error),
    );
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const { document } = job;
    let transcriptionURL = document.transcriptionURL;
    if (transcriptionURL === null) {
      await setStage("reading");
      const raw = await providers.blobs.get(document.rawURL);
      const text = await providers.extractor.extract(raw, document.mimeType);
      transcriptionURL = await providers.blobs.put(
        `u${document.userId}/document-${document.id}.transcript`,
        text,
      );
      await prisma.document.update({ where: { id: document.id }, data: { transcriptionURL } });
    }

    await setStage("writing");
    const transcript = (await providers.blobs.get(transcriptionURL)).toString("utf-8");
    const reportProgress = throttledProgress((questionsWritten) => write({ questionsWritten }));
    const draft = await providers.generator.generate(transcript, (count) =>
      reportProgress.report(count),
    );
    await reportProgress.flush();

    if (!(await setStage("saving"))) return; // This claim was taken over; the new runner saves.
    await saveGeneratedQuiz(prisma, document.id, draft);
    await write({
      status: "succeeded",
      stage: null,
      questionsWritten: draft.questions.length,
      error: null,
      finishedAt: new Date(),
    });
  } catch (error) {
    await recordFailure(prisma, job, error);
  } finally {
    clearInterval(heartbeat);
  }
}

// Saves the latest progress count at most once a second, in order.
function throttledProgress(save: (questionsWritten: number) => Promise<unknown>) {
  let latest = 0;
  let saved = 0;
  let lastSaveAt = 0;
  let chain: Promise<unknown> = Promise.resolve();
  const saveLatest = () => {
    chain = chain.then(async () => {
      if (latest === saved) return;
      saved = latest;
      await save(latest).catch((error) => console.error("Saving progress failed:", error));
    });
    return chain;
  };
  return {
    report(questionsWritten: number) {
      latest = questionsWritten;
      if (Date.now() - lastSaveAt >= PROGRESS_INTERVAL_MS) {
        lastSaveAt = Date.now();
        void saveLatest();
      }
    },
    flush: () => saveLatest(),
  };
}

// Fails the job, or queues a retry if the error may be temporary and attempts remain.
async function recordFailure(prisma: PrismaClient, job: JobRow, error: unknown) {
  console.error(`Quiz job ${job.id} attempt ${job.attempts} failed:`, error);
  const write = claimWriter(prisma, job.id, job.attempts);

  if (error instanceof PermanentJobError) {
    await write({ status: "failed", stage: null, error: error.message, finishedAt: new Date() });
  } else if (job.attempts < MAX_ATTEMPTS) {
    const delay = RETRY_DELAYS_MS[job.attempts - 1] ?? RETRY_DELAYS_MS.at(-1)!;
    await write({
      status: "queued",
      stage: null,
      heartbeatAt: null,
      runAfter: new Date(Date.now() + delay),
    });
  } else {
    await write({ status: "failed", stage: null, error: GENERIC_FAILURE, finishedAt: new Date() });
  }
}

// Requeues running jobs whose worker stopped sending heartbeats, or fails them if out of attempts.
export async function recoverStaleJobs(prisma: PrismaClient, now = new Date()): Promise<number> {
  const stale = {
    status: "running" as const,
    heartbeatAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) },
  };
  const failed = await prisma.quizJob.updateMany({
    where: { ...stale, attempts: { gte: MAX_ATTEMPTS } },
    data: { status: "failed", stage: null, error: GENERIC_FAILURE, finishedAt: now },
  });
  const requeued = await prisma.quizJob.updateMany({
    where: stale,
    data: { status: "queued", stage: null, heartbeatAt: null, runAfter: now },
  });
  return failed.count + requeued.count;
}

// Claims and runs one due job. Returns false if there was nothing to run.
export async function runNextJob(deps: Deps): Promise<boolean> {
  const jobId = await claimNextJob(deps.prisma);
  if (jobId === null) return false;
  await runQuizJob(deps, jobId);
  return true;
}
