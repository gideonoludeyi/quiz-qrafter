import {
  Prisma,
  type PrismaClient,
  type JobStage,
  type GenerateQuizJob as JobRow,
} from "@prisma/client";
import { type AppError, AppErrorSchema, type GenerateQuizJob } from "@quizqrafter/shared";
import { annotate, recordError, withWideEvent } from "../observability/events";
import { PermanentJobError } from "../providers/errors";
import { readDocument } from "./documentReader";
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

// Error codes for failures users can't act on beyond trying again.
const GENERIC_FAILURE = { errorCode: "errors.jobs.generic", errorValues: Prisma.DbNull };
const NOT_QUEUED = { errorCode: "errors.jobs.notQueued", errorValues: Prisma.DbNull };
const ACTIVE: JobRow["status"][] = ["queued", "running"];

type Db = Prisma.TransactionClient;

// Converts a job row to the shared shape. `quizId` is the document's quiz, shown once the job succeeded.
export function toGenerateQuizJob(row: JobRow, documentQuizId: number | null): GenerateQuizJob {
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status,
    stage: row.stage,
    questionsWritten: row.questionsWritten,
    error: row.errorCode === null ? null : toAppError(row.errorCode, row.errorValues),
    quizId: row.status === "succeeded" ? documentQuizId : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// A stored error code and its values, in the shared shape.
function toAppError(code: string, values: Prisma.JsonValue): AppError {
  const parsed = AppErrorSchema.shape.values.safeParse(values ?? undefined);
  return parsed.success && parsed.data !== undefined ? { code, values: parsed.data } : { code };
}

const withDocumentQuiz = { document: { select: { quiz: { select: { id: true } } } } } as const;
type JobWithDocumentQuiz = Prisma.GenerateQuizJobGetPayload<{ include: typeof withDocumentQuiz }>;

function toGenerateQuizJobWithQuiz(row: JobWithDocumentQuiz): GenerateQuizJob {
  return toGenerateQuizJob(row, row.document.quiz?.id ?? null);
}

// Throws TooManyJobsError if the user already has the most GenerateQuizJobs in progress allowed.
// Not binding on its own: only startGenerateQuizJob counts under the lock.
export async function assertCanStartJob(db: Db, userId: number): Promise<void> {
  const active = await db.generateQuizJob.count({
    where: { status: { in: ACTIVE }, document: { userId } },
  });
  if (active >= MAX_ACTIVE_JOBS_PER_USER) throw new TooManyJobsError(MAX_ACTIVE_JOBS_PER_USER);
}

// A document to create along with its first GenerateQuizJob.
export type NewDocument = { filename: string; mimeType: string; size: number; rawURL: string };

// Starts and sends a GenerateQuizJob for a document, or returns the document's job already in progress.
export async function startGenerateQuizJob(
  { prisma, queue }: Pick<Deps, "prisma" | "queue">,
  userId: number,
  target: number | { newDocument: NewDocument },
): Promise<GenerateQuizJob> {
  const { row, started } = await prisma.$transaction(async (tx) => {
    // Serializes starts per user, so two at once can't both pass the limit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${START_LOCK}::int, ${userId}::int)`;

    if (typeof target === "number") {
      const document = await tx.document.findFirst({ where: { id: target, userId } });
      if (document === null) throw new NotFoundError("errors.notFound.document");
      const existing = await tx.generateQuizJob.findFirst({
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
    const created = await tx.generateQuizJob.create({
      data: { documentId },
      include: withDocumentQuiz,
    });
    return { row: created, started: true };
  });
  annotate({
    "app.document.id": row.documentId,
    "app.job.id": row.id,
    "app.job.kind": "generate_quiz",
    "app.job.start": started ? "started" : "existing",
  });
  if (!started) return toGenerateQuizJobWithQuiz(row);

  // Sent after the commit, so a worker never sees a job before its row exists.
  try {
    await queue.send(row.id);
  } catch (error) {
    // Fail the row rather than leave it queued with no message; the user can try again.
    annotate({ "app.job.start": "not_queued" });
    recordError(error, true);
    const failed = await prisma.generateQuizJob.update({
      where: { id: row.id },
      data: { status: "failed", ...NOT_QUEUED, finishedAt: new Date() },
      include: withDocumentQuiz,
    });
    return toGenerateQuizJobWithQuiz(failed);
  }
  return toGenerateQuizJobWithQuiz(row);
}

export async function getGenerateQuizJob(
  { prisma }: Pick<Deps, "prisma">,
  userId: number,
  jobId: number,
): Promise<GenerateQuizJob> {
  const row = await prisma.generateQuizJob.findFirst({
    where: { id: jobId, document: { userId } },
    include: withDocumentQuiz,
  });
  if (row === null) throw new NotFoundError("errors.notFound.generateQuizJob");
  return toGenerateQuizJobWithQuiz(row);
}

// Only the run that owns a job may write to it; a takeover after a stall makes older runs stale.
const ownedBy = (jobId: number, run: number) =>
  ({ id: jobId, status: "running", attempts: run }) as const;

// Writes to a running job, but only while `run` still owns it. Returns whether it did.
function runWriter(prisma: PrismaClient, jobId: number, run: number) {
  return async (data: Prisma.GenerateQuizJobUpdateManyMutationInput): Promise<boolean> => {
    const { count } = await prisma.generateQuizJob.updateMany({ where: ownedBy(jobId, run), data });
    return count > 0;
  };
}

// Reads the document if needed, writes and saves the quiz. Throws only when the job should be retried.
export function processGenerateQuizJob(
  deps: Pick<Deps, "prisma" | "providers">,
  jobId: number,
  { run, final }: Run,
): Promise<void> {
  return withWideEvent(
    "job.run",
    {
      "app.job.id": jobId,
      "app.job.kind": "generate_quiz",
      "app.job.run": run,
      "app.job.final": final,
    },
    () => runGenerateQuizJob(deps, jobId, run, final),
  );
}

async function runGenerateQuizJob(
  { prisma, providers }: Pick<Deps, "prisma" | "providers">,
  jobId: number,
  run: number,
  final: boolean,
): Promise<void> {
  const { count } = await prisma.generateQuizJob.updateMany({
    where: { id: jobId, status: { in: ACTIVE } },
    data: { status: "running", attempts: run, stage: null, questionsWritten: 0 },
  });
  if (count === 0) {
    annotate({ "app.job.outcome": "skipped" }); // Deleted, or already finished.
    return;
  }

  const job = await prisma.generateQuizJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { document: true },
  });
  annotate({
    "app.document.id": job.documentId,
    "app.user.id": job.document.userId,
    "app.document.mime_type": job.document.mimeType,
  });
  const write = runWriter(prisma, job.id, run);
  const setStage = (stage: JobStage) => {
    annotate({ "app.generate_quiz.stage": stage });
    return write({ stage });
  };

  try {
    const { document } = job;
    let transcriptionURL = document.transcriptionURL;
    if (transcriptionURL === null) {
      await setStage("reading");
      const raw = await providers.blobs.get(document.rawURL);
      const text = await readDocument(providers.transcriber, raw, document.mimeType);
      transcriptionURL = await providers.blobs.put(
        `u${document.userId}/document-${document.id}.transcript`,
        text,
      );
      await prisma.document.update({ where: { id: document.id }, data: { transcriptionURL } });
    } else {
      annotate({ "app.document.read_from": "transcript" });
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
      const { count } = await tx.generateQuizJob.updateMany({
        where: ownedBy(job.id, run),
        data: {
          status: "succeeded",
          stage: null,
          questionsWritten: draft.questions.length,
          errorCode: null,
          errorValues: Prisma.DbNull,
          finishedAt: new Date(),
        },
      });
      if (count === 0) {
        annotate({ "app.job.outcome": "superseded" });
        return;
      }
      await saveGeneratedQuiz(tx, document.id, draft);
      annotate({
        "app.job.outcome": "succeeded",
        "app.generate_quiz.questions_written": draft.questions.length,
      });
    });
  } catch (error) {
    const permanent = error instanceof PermanentJobError;
    recordError(error, !permanent);
    annotate({ "app.job.outcome": permanent || final ? "failed" : "retrying" });
    if (permanent) {
      await write({
        status: "failed",
        stage: null,
        errorCode: error.code,
        errorValues: error.values ?? Prisma.DbNull,
        finishedAt: new Date(),
      });
    } else if (final) {
      await write({ status: "failed", stage: null, ...GENERIC_FAILURE, finishedAt: new Date() });
    } else {
      // Shown as waiting while the queue holds the retry back.
      await write({ status: "queued", stage: null });
      throw error;
    }
  }
}

// Fails a job the queue gave up on outside processGenerateQuizJob, e.g. after it stalled too often.
export function giveUpGenerateQuizJob(
  { prisma }: Pick<Deps, "prisma">,
  jobId: number,
): Promise<void> {
  return withWideEvent(
    "job.give_up",
    { "app.job.id": jobId, "app.job.kind": "generate_quiz" },
    async () => {
      const { count } = await prisma.generateQuizJob.updateMany({
        where: { id: jobId, status: { in: ACTIVE } },
        data: { status: "failed", stage: null, ...GENERIC_FAILURE, finishedAt: new Date() },
      });
      annotate({ "app.job.outcome": count > 0 ? "failed" : "skipped" });
    },
  );
}

// Matches unfinished jobs to their queue messages: re-sends jobs whose message is missing
// (e.g. the API stopped between saving the row and sending it) and fails ones the queue gave up on.
export function reconcileGenerateQuizJobs({
  prisma,
  queue,
}: Pick<Deps, "prisma" | "queue">): Promise<void> {
  return withWideEvent("job.reconcile", {}, async () => {
    const rows = await prisma.generateQuizJob.findMany({
      where: { status: { in: ACTIVE } },
      select: { id: true },
    });
    let resent = 0;
    let givenUp = 0;
    for (const { id } of rows) {
      const state = await queue.stateOf(id);
      if (state === "gone") {
        await queue.send(id);
        resent++;
      } else if (state === "finished") {
        await giveUpGenerateQuizJob({ prisma }, id);
        givenUp++;
      }
    }
    annotate({ "app.job.resent": resent, "app.job.given_up": givenUp });
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
      await save(latest).catch(() => annotate({ "app.job.progress_save_failed": true }));
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
