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
