import {
  type ApiErrorResponse,
  MAX_UPLOAD_BYTES,
  type TranslationValues,
} from "@quizqrafter/shared";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { NotFoundError, TooManyJobsError, UnsupportedFileError } from "../../core/types";
import { t } from "../../i18n";
import { annotate, recordError } from "../../observability/events";
import { CodedError } from "../../providers/errors";
import type { AppEnv } from "./env";

const IdSchema = z.coerce.number().int().positive();

// Thrown when a request body is not valid JSON.
export class InvalidJsonError extends CodedError {
  override name = "InvalidJsonError";

  constructor() {
    super("errors.request.invalid");
  }
}

// Parses a numeric id from a route parameter; invalid ids become a 400.
export function parseId(value: string): number {
  return IdSchema.parse(value);
}

// Reads a JSON body and validates it; malformed JSON or a schema mismatch becomes a 400.
export async function parseJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new InvalidJsonError();
  }
  return schema.parse(body);
}

// The body of an error response: the code and values for the frontend, and the English for logs and curl.
function errorBody(code: string, values?: TranslationValues): ApiErrorResponse {
  return { error: { code, ...(values && { values }), message: t(code, values) } };
}

// An error response whose `code` is a catalogue key under errors.*.
export function sendError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  values?: TranslationValues,
) {
  return c.json(errorBody(code, values), status);
}

// The 413 response for uploads over the size limit.
export function fileTooLarge(c: Context) {
  return sendError(c, 413, "errors.upload.tooLarge", { maxMb: MAX_UPLOAD_BYTES / (1024 * 1024) });
}

// Requires a logged-in session.
export const restrict = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("userId") === undefined) return sendError(c, 401, "errors.session.ended");
  await next();
});

// Reads the logged-in user's id. Use only behind `restrict`.
export function userIdOf(c: Context<AppEnv>): number {
  return c.get("userId")!;
}

// The status for an error users can act on, or undefined if it is a server failure.
function statusOf(error: Error): ContentfulStatusCode | undefined {
  if (error instanceof InvalidJsonError) return 400;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof UnsupportedFileError) return 415;
  if (error instanceof TooManyJobsError) return 429;
  return undefined;
}

// Maps known errors to status codes; anything else is a 500, recorded in full.
export function errorHandler(error: Error, c: Context) {
  annotate({ "error.type": error.name });
  if (error instanceof z.ZodError) {
    return c.json({ ...errorBody("errors.request.invalid"), issues: error.issues }, 400);
  }
  const status = statusOf(error);
  if (error instanceof CodedError && status !== undefined) {
    return sendError(c, status, error.code, error.values);
  }
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  recordError(error);
  return sendError(c, 500, "errors.server");
}
