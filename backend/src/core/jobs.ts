import { Prisma, type PrismaClient, type JobStage, type QuizJob as JobRow } from "@prisma/client";
import type { QuizJob } from "@quizqrafter/shared";
import { PermanentJobError } from "../providers/errors";
import { saveGeneratedQuiz } from "./quizzes";
import { type Deps, NotFoundError, type Run, TooManyJobsError } from "./types";

// Business rule: how many quizzes one user may have queued or running at once.
export const MAX_ACTIVE_JOBS_PER_USER = 3;
// Business rule: a job that fails for a reason a retry might fix is run at most this many times.
export const MAX_RUNS = 3;
// The wait before the first retry; it doubles for each retry after that.
export const RETRY_DELAY_MS = 30_000;
const PROGRESS_INTERVAL_MS = 1_000;
// Namespaces the per-user advisory lock taken while starting jobs.
const START_LOCK = 7101;

const GENERIC_FAILURE = "Something went wrong while making your quiz. Please try again.";
const NOT_QUEUED = "Your quiz couldn't be started. Please try again.";
const ACTIVE: JobRow["status"][] = ["queued", "running"];

type Db = Prisma.TransactionClient;

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

// Throws TooManyJobsError if the user already has the most quiz jobs in progress allowed.
// Not binding on its own: only startQuizJob counts under the lock.
export async function assertCanStartJob(db: Db, userId: number): Promise<void> {
  const active = await db.quizJob.count({
    where: { status: { in: ACTIVE }, document: { userId } },
  });
  if (active >= MAX_ACTIVE_JOBS_PER_USER) throw new TooManyJobsError(MAX_ACTIVE_JOBS_PER_USER);
}

// A document to create along with its first quiz job.
export type NewDocument = { filename: string; mimeType: string; size: number; rawURL: string };

// Starts a quiz job for one of the user's documents, or for a new one, and sends it to the workers.
// Returns the document's job already in progress instead of starting a second one.
export async function startQuizJob(
  { prisma, queue }: Pick<Deps, "prisma" | "queue">,
  userId: number,
  target: number | { newDocument: NewDocument },
): Promise<QuizJob> {
  const { row, started } = await prisma.$transaction(async (tx) => {
    // Serializes starts per user, so two at once can't both pass the limit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${START_LOCK}::int, ${userId}::int)`;

    if (typeof target === "number") {
      const document = await tx.document.findFirst({ where: { id: target, userId } });
      if (document === null) throw new NotFoundError("Document");
      const existing = await tx.quizJob.findFirst({
        where: { documentId: target, status: { in: ACTIVE } },
        include: withDocumentQuiz,
      });
      if (existing !== null) return { row: existing, started: false };
    }

    await assertCanStartJob(tx, userId);
    const documentId =
      typeof target === "number"
        ? target
        : (await tx.document.create({ data: { ...target.newDocument, userId } })).id;
    const created = await tx.quizJob.create({ data: { documentId }, include: withDocumentQuiz });
    return { row: created, started: true };
  });
  if (!started) return toQuizJobWithQuiz(row);

  // Sent after the commit, so a worker never sees a job before its row exists.
  try {
    await queue.send(row.id);
  } catch (error) {
    // Fail the row rather than leave it queued with no message; the user can try again.
    console.error(`Sending quiz job ${row.id} to the queue failed:`, error);
    const failed = await prisma.quizJob.update({
      where: { id: row.id },
      data: { status: "failed", error: NOT_QUEUED, finishedAt: new Date() },
      include: withDocumentQuiz,
    });
    return toQuizJobWithQuiz(failed);
  }
  return toQuizJobWithQuiz(row);
}

export async function getQuizJob(
  { prisma }: Pick<Deps, "prisma">,
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

// Only the run that owns a job may write to it; a takeover after a stall makes older runs stale.
const ownedBy = (jobId: number, run: number) =>
  ({ id: jobId, status: "running", attempts: run }) as const;

// Writes to a running job, but only while `run` still owns it. Returns whether it did.
function runWriter(prisma: PrismaClient, jobId: number, run: number) {
  return async (data: Prisma.QuizJobUpdateManyMutationInput): Promise<boolean> => {
    const { count } = await prisma.quizJob.updateMany({ where: ownedBy(jobId, run), data });
    return count > 0;
  };
}

// Reads the document if needed, writes the quiz, and saves it, recording progress on the job.
// Throws only when the job should be retried; other failures are recorded on the row.
export async function processQuizJob(
  { prisma, providers }: Pick<Deps, "prisma" | "providers">,
  jobId: number,
  { run, final }: Run,
): Promise<void> {
  const { count } = await prisma.quizJob.updateMany({
    where: { id: jobId, status: { in: ACTIVE } },
    data: { status: "running", attempts: run, stage: null, questionsWritten: 0 },
  });
  if (count === 0) return; // Deleted, or already finished.

  const job = await prisma.quizJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { document: true },
  });
  const write = runWriter(prisma, job.id, run);
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

    // The quiz and the job's success commit together, and only while this run owns the job.
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.quizJob.updateMany({
        where: ownedBy(job.id, run),
        data: {
          status: "succeeded",
          stage: null,
          questionsWritten: draft.questions.length,
          error: null,
          finishedAt: new Date(),
        },
      });
      if (count > 0) await saveGeneratedQuiz(tx, document.id, draft);
    });
  } catch (error) {
    console.error(`Quiz job ${job.id} (run ${run}) failed:`, error);
    if (error instanceof PermanentJobError) {
      await write({ status: "failed", stage: null, error: error.message, finishedAt: new Date() });
    } else if (final) {
      await write({
        status: "failed",
        stage: null,
        error: GENERIC_FAILURE,
        finishedAt: new Date(),
      });
    } else {
      // Shown as waiting while the queue holds the retry back.
      await write({ status: "queued", stage: null });
      throw error;
    }
  }
}

// Fails a job the queue gave up on outside processQuizJob, e.g. after it stalled too often.
export async function giveUpQuizJob(
  { prisma }: Pick<Deps, "prisma">,
  jobId: number,
): Promise<void> {
  await prisma.quizJob.updateMany({
    where: { id: jobId, status: { in: ACTIVE } },
    data: { status: "failed", stage: null, error: GENERIC_FAILURE, finishedAt: new Date() },
  });
}

// Matches unfinished jobs to their queue messages: re-sends jobs whose message is missing
// (e.g. the API stopped between saving the row and sending it) and fails ones the queue gave up on.
export async function reconcileQuizJobs({
  prisma,
  queue,
}: Pick<Deps, "prisma" | "queue">): Promise<void> {
  const rows = await prisma.quizJob.findMany({
    where: { status: { in: ACTIVE } },
    select: { id: true },
  });
  for (const { id } of rows) {
    const state = await queue.stateOf(id);
    if (state === "gone") await queue.send(id);
    else if (state === "finished") await giveUpQuizJob({ prisma }, id);
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
