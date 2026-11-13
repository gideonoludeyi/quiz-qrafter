import { Prisma, type PrismaClient, type JobStage, type QuizJob as JobRow } from "@prisma/client";
import type { QuizJob } from "@quizqrafter/shared";
import { PermanentJobError } from "../providers/errors";
import { saveGeneratedQuiz } from "./quizzes";
import { type Deps, NotFoundError, TooManyJobsError } from "./types";

// Business rule: how many quizzes one user may have queued or running at once.
export const MAX_ACTIVE_JOBS_PER_USER = 3;
const PROGRESS_INTERVAL_MS = 1_000;

export const GENERIC_FAILURE = "Something went wrong while making your quiz. Please try again.";
const NOT_QUEUED = "Your quiz couldn't be started. Please try again.";
export const ACTIVE: JobRow["status"][] = ["queued", "running"];

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

// Throws TooManyJobsError if the user already has the most quiz jobs in progress allowed.
export async function assertCanStartJob(prisma: PrismaClient, userId: number): Promise<void> {
  const active = await prisma.quizJob.count({
    where: { status: { in: ACTIVE }, document: { userId } },
  });
  if (active >= MAX_ACTIVE_JOBS_PER_USER) throw new TooManyJobsError(MAX_ACTIVE_JOBS_PER_USER);
}

// Queues a quiz job for one of the user's documents and sends it to the workers.
// Returns the document's job already in progress instead of starting a second one.
export async function enqueueQuizJob(
  { prisma, queue }: Deps,
  userId: number,
  documentId: number,
): Promise<QuizJob> {
  const document = await prisma.document.findFirst({ where: { id: documentId, userId } });
  if (document === null) throw new NotFoundError("Document");

  const existing = await findActiveJob(prisma, documentId);
  if (existing !== null) return toQuizJobWithQuiz(existing);

  await assertCanStartJob(prisma, userId);

  let row: JobWithDocumentQuiz;
  try {
    row = await prisma.quizJob.create({ data: { documentId }, include: withDocumentQuiz });
  } catch (error) {
    // A concurrent request queued one first; the partial unique index rejected ours.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await findActiveJob(prisma, documentId);
      if (raced !== null) return toQuizJobWithQuiz(raced);
    }
    throw error;
  }

  try {
    await queue.add(row.id);
  } catch (error) {
    // Fail the row rather than leave it queued with no message; the user can try again.
    console.error(`Sending quiz job ${row.id} to the queue failed:`, error);
    row = await prisma.quizJob.update({
      where: { id: row.id },
      data: { status: "failed", error: NOT_QUEUED, finishedAt: new Date() },
      include: withDocumentQuiz,
    });
  }
  return toQuizJobWithQuiz(row);
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

// Writes to a claimed job, but only while this claim still owns it. If BullMQ restarted a
// stalled job on another worker, the old run's writes are ignored.
function claimWriter(prisma: PrismaClient, jobId: number, attempt: number) {
  return async (data: Prisma.QuizJobUpdateManyMutationInput): Promise<boolean> => {
    const { count } = await prisma.quizJob.updateMany({
      where: { id: jobId, status: "running", attempts: attempt },
      data,
    });
    return count > 0;
  };
}

// Which run of a BullMQ job this is. `claim` (BullMQ's attemptsStarted) is unique per run,
// including restarts after a stall; `lastAttempt` says whether a failure may be retried.
export type JobRun = { claim: number; lastAttempt: boolean };

// Reads the document if needed, writes the quiz, and saves it, recording progress on the job.
// Throws only when the job should be retried; other failures are recorded on the row.
export async function runQuizJob(deps: Deps, jobId: number, run: JobRun): Promise<void> {
  const { prisma, providers } = deps;
  const { count } = await prisma.quizJob.updateMany({
    where: { id: jobId, status: { in: ACTIVE } },
    data: { status: "running", attempts: run.claim, stage: null, questionsWritten: 0 },
  });
  if (count === 0) return; // Deleted, or already finished.

  const job = await prisma.quizJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { document: true },
  });
  const write = claimWriter(prisma, job.id, run.claim);
  const setStage = (stage: JobStage) => write({ stage });

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

    if (!(await setStage("saving"))) return; // This claim was taken over; the new run saves.
    await saveGeneratedQuiz(prisma, document.id, draft);
    await write({
      status: "succeeded",
      stage: null,
      questionsWritten: draft.questions.length,
      error: null,
      finishedAt: new Date(),
    });
  } catch (error) {
    console.error(`Quiz job ${job.id} (run ${run.claim}) failed:`, error);
    if (error instanceof PermanentJobError) {
      await write({ status: "failed", stage: null, error: error.message, finishedAt: new Date() });
    } else if (run.lastAttempt) {
      await write({
        status: "failed",
        stage: null,
        error: GENERIC_FAILURE,
        finishedAt: new Date(),
      });
    } else {
      // Shown as waiting while BullMQ holds the retry back.
      await write({ status: "queued", stage: null });
      throw error;
    }
  }
}

// Fails a job BullMQ gave up on outside runQuizJob, e.g. after it stalled too often.
export async function failQuizJob(prisma: PrismaClient, jobId: number): Promise<void> {
  await prisma.quizJob.updateMany({
    where: { id: jobId, status: { in: ACTIVE } },
    data: { status: "failed", stage: null, error: GENERIC_FAILURE, finishedAt: new Date() },
  });
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
