import type { PrismaClient } from "@prisma/client";
import { CodedError } from "../providers/errors";
import type { Providers } from "../providers/types";

// Where a GenerateQuizJob's queue message is: still to be run, finished with, or never sent.
export type MessageState = "waiting" | "finished" | "gone";

// Carries GenerateQuizJobs to the workers. Adapters: BullMQ, and in-memory for tests and scripts.
export type QuizQueue = {
  // Sends a job to the workers; sending the same job twice is a no-op.
  send(generateQuizJobId: number): Promise<void>;
  stateOf(generateQuizJobId: number): Promise<MessageState>;
};

// One delivery of a GenerateQuizJob to a worker. `run` is unique per delivery; no retry follows a `final` one.
export type Run = { run: number; final: boolean };

// What core functions need: the database, the queue to the workers, and the external providers.
export type Deps = {
  prisma: PrismaClient;
  queue: QuizQueue;
  providers: Providers;
};

// Thrown when a record does not exist or belongs to another user. `code` names what is missing.
export class NotFoundError extends CodedError {
  override name = "NotFoundError";
}

// Thrown when a user already has the maximum number of GenerateQuizJobs in progress.
export class TooManyJobsError extends CodedError {
  override name = "TooManyJobsError";

  constructor(limit: number) {
    super("errors.jobs.tooManyActive", { values: { count: limit } });
  }
}

// Thrown when an upload is not a file type the app can read.
export class UnsupportedFileError extends CodedError {
  override name = "UnsupportedFileError";

  constructor() {
    super("errors.upload.unsupportedType");
  }
}
