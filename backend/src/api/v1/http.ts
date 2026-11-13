import { MAX_UPLOAD_BYTES } from "@quizqrafter/shared";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { NotFoundError, TooManyJobsError, UnsupportedFileError } from "../../core/types";
import type { AppEnv } from "./env";

const IdSchema = z.coerce.number().int().positive();

const STATUS_TEXT: Partial<Record<ContentfulStatusCode, string>> = {
  200: "OK",
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
  500: "Internal Server Error",
};

// Thrown when a request body is not valid JSON.
export class InvalidJsonError extends Error {
  constructor() {
    super("Request body is not valid JSON");
    this.name = "InvalidJsonError";
  }
}

// Parses a numeric id from a route parameter; invalid ids become a 400.
export function parseId(value: string): number {
  return IdSchema.parse(value);
}

// Reads a JSON body and validates it; malformed JSON or a schema mismatch becomes a 400.
export async function parseJson<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new InvalidJsonError();
  }
  return schema.parse(body);
}

// A plain-text response carrying only a status, like Express's res.sendStatus().
export function sendStatus(c: Context, status: ContentfulStatusCode) {
  return c.text(STATUS_TEXT[status] ?? String(status), status);
}

// The 413 response for uploads over the size limit.
export function fileTooLarge(c: Context) {
  return c.json({ error: `Files can be at most ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` }, 413);
}

// Requires a logged-in session and makes the user's id available to `userIdOf`.
export const restrict = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("session").get("userId");
  if (!userId) return sendStatus(c, 401);
  c.set("userId", userId);
  await next();
});

// Reads the logged-in user's id. Use only behind `restrict`.
export function userIdOf(c: Context<AppEnv>): number {
  return c.get("userId");
}

// Maps known errors to status codes; anything else is a 500.
export function errorHandler(error: Error, c: Context) {
  if (error instanceof z.ZodError) {
    return c.json({ error: "Invalid request", issues: error.issues }, 400);
  }
  if (error instanceof InvalidJsonError) {
    return c.json({ error: "Invalid request" }, 400);
  }
  if (error instanceof NotFoundError) {
    return c.json({ error: error.message }, 404);
  }
  if (error instanceof UnsupportedFileError) {
    return c.json({ error: error.message }, 415);
  }
  if (error instanceof TooManyJobsError) {
    return c.json({ error: error.message }, 429);
  }
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  console.error(error);
  return sendStatus(c, 500);
}
