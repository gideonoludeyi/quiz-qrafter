import type { PrismaClient } from "@prisma/client";
import type { Providers } from "../providers/types";

// Where a quiz job's queue message is: still to be run, finished with, or never sent.
export type MessageState = "waiting" | "finished" | "gone";

// Carries quiz jobs to the workers. Adapters: BullMQ, and in-memory for tests and scripts.
export type QuizQueue = {
  // Sends a job to the workers; sending the same job twice is a no-op.
  send(quizJobId: number): Promise<void>;
  stateOf(quizJobId: number): Promise<MessageState>;
};

// One delivery of a quiz job to a worker. `run` is unique per delivery; no retry follows a `final` one.
export type Run = { run: number; final: boolean };

// What core functions need: the database, the queue to the workers, and the external providers.
export type Deps = {
  prisma: PrismaClient;
  queue: QuizQueue;
  providers: Providers;
};

// Thrown when a record does not exist or belongs to another user.
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

// Thrown when a user already has the maximum number of quiz jobs in progress.
export class TooManyJobsError extends Error {
  constructor(limit: number) {
    super(`You can have at most ${limit} quizzes in progress. Wait for one to finish.`);
    this.name = "TooManyJobsError";
  }
}

// Thrown when an upload is not a file type the app can read.
export class UnsupportedFileError extends Error {
  constructor() {
    super("This file type isn't supported. Upload a PDF, image, Word or text file.");
    this.name = "UnsupportedFileError";
  }
}
