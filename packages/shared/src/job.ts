import { z } from "zod";
import { AppErrorSchema } from "./errors";

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export const JOB_STAGES = ["reading", "writing"] as const;

export const GenerateQuizJobSchema = z.object({
  id: z.number().int(),
  documentId: z.number().int(),
  status: z.enum(JOB_STATUSES),
  // Which part of the work is running; null while queued and once finished.
  stage: z.enum(JOB_STAGES).nullable(),
  questionsWritten: z.number().int(),
  // Why the job failed, set when it does.
  error: AppErrorSchema.nullable(),
  // Set once the job has succeeded.
  quizId: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const StartJobRequestSchema = z.object({
  documentId: z.number().int(),
});

export type GenerateQuizJob = z.infer<typeof GenerateQuizJobSchema>;
export type JobStatus = GenerateQuizJob["status"];
export type JobStage = NonNullable<GenerateQuizJob["stage"]>;

export function isJobActive(job: Pick<GenerateQuizJob, "status"> | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}
