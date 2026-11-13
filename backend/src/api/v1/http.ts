import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "@quizqrafter/shared";
import multer from "multer";
import { NotFoundError, TooManyJobsError, UnsupportedFileError } from "../../core/types";

const IdSchema = z.coerce.number().int().positive();

// Parses a numeric id from a route parameter; invalid ids become a 400.
export function parseId(value: string): number {
  return IdSchema.parse(value);
}

// Express 4 does not catch rejected promises, so async handlers go through this.
export function wrap(
  handler: (request: Request, response: Response) => Promise<unknown>,
): RequestHandler {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}

// Requires a logged-in session.
export function restrict(request: Request, response: Response, next: NextFunction) {
  if (request.session.userId) {
    return next();
  }
  return response.sendStatus(401 /* Unauthorized */);
}

// Reads the logged-in user's id. Use only behind `restrict`.
export function userIdOf(request: Request): number {
  return request.session.userId!;
}

// Maps known errors to status codes; anything else is a 500.
export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  if (error instanceof z.ZodError) {
    return response
      .status(400 /* Bad Request */)
      .json({ error: "Invalid request", issues: error.issues });
  }
  if (error instanceof NotFoundError) {
    return response.status(404 /* Not Found */).json({ error: error.message });
  }
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return response
      .status(413 /* Content Too Large */)
      .json({ error: `Files can be at most ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` });
  }
  if (error instanceof UnsupportedFileError) {
    return response.status(415 /* Unsupported Media Type */).json({ error: error.message });
  }
  if (error instanceof TooManyJobsError) {
    return response.status(429 /* Too Many Requests */).json({ error: error.message });
  }
  console.error(error);
  return response.sendStatus(500);
}
