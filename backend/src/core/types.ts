import type { PrismaClient } from "@prisma/client";
import type { Providers } from "../providers/types";

// What core functions need: the database and the external providers.
export type Deps = {
  prisma: PrismaClient;
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
