import { z } from "zod";

// A failure the user may see: a catalogue key under errors.*, and the values its message needs.
export const AppErrorSchema = z.object({
  code: z.string(),
  values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

// The body of every API error response. `message` is the English, for logs and curl.
export const ApiErrorResponseSchema = z.object({
  error: AppErrorSchema.extend({ message: z.string() }),
});

export type AppError = z.infer<typeof AppErrorSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
