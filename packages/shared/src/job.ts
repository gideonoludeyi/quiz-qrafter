import { z } from "zod";

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export const JOB_STAGES = ["reading", "writing", "saving"] as const;

export const QuizJobSchema = z.object({
  id: z.number().int(),
  documentId: z.number().int(),
  status: z.enum(JOB_STATUSES),
  // Which part of the work is running; null while queued and once finished.
  stage: z.enum(JOB_STAGES).nullable(),
  questionsWritten: z.number().int(),
  // A message safe to show the user, set when the job fails.
  error: z.string().nullable(),
  // Set once the job has succeeded.
  quizId: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const StartJobRequestSchema = z.object({
  documentId: z.number().int(),
});

export type QuizJob = z.infer<typeof QuizJobSchema>;
export type JobStatus = QuizJob["status"];
export type JobStage = NonNullable<QuizJob["stage"]>;

export function isJobActive(job: Pick<QuizJob, "status"> | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}
