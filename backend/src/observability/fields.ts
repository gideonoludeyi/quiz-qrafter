// Every wide event field: OpenTelemetry names where they exist, app.* glossary names otherwise. Never personal data.
export type EventFields = {
  "http.request.method"?: string;
  // The route pattern, such as /api/v1/jobs/:id, never the URL with its ids.
  "http.route"?: string;
  "http.response.status_code"?: number;

  "app.user.id"?: number;

  "app.document.id"?: number;
  "app.document.mime_type"?: string;
  // How the document's text was read: on the server, by the AI, or from the PDF's text layer.
  "app.document.read_from"?: "local" | "ai" | "pdf_text_layer" | "transcript";
  // A stored file that no document refers to could not be deleted.
  "app.document.orphaned_file"?: boolean;

  "app.job.id"?: number;
  "app.job.kind"?: "generate_quiz";
  "app.job.run"?: number;
  "app.job.final"?: boolean;
  // started: a new Job was queued; existing: the document's Active Job was returned instead.
  "app.job.start"?: "started" | "existing" | "not_queued";
  // What a Run did with its Job. superseded: a newer Run owns it; skipped: it had finished, or was deleted.
  "app.job.outcome"?: "succeeded" | "failed" | "retrying" | "superseded" | "skipped";
  "app.job.progress_save_failed"?: boolean;
  // Counts from a worker's startup reconcile.
  "app.job.resent"?: number;
  "app.job.given_up"?: number;

  "app.generate_quiz.stage"?: string;
  "app.generate_quiz.questions_written"?: number;
  // Defects in the model's quiz that were repaired, or whose questions were dropped.
  "app.generate_quiz.blank_choices_removed"?: number;
  "app.generate_quiz.questions_dropped"?: number;

  "app.ai.finish_reason"?: string;

  "error.type"?: string;
  "exception.message"?: string;
  "exception.stacktrace"?: string;
  // The messages of the error's causes, outermost first.
  "app.error.cause"?: string;
  // Whether retrying could fix the failure.
  "app.error.retriable"?: boolean;
  // False for errors we didn't anticipate, which are likely bugs and carry a stack.
  "app.error.expected"?: boolean;
};

// Fields of a child span, such as one AI call. OpenTelemetry's gen_ai names where they exist.
export type SpanFields = {
  "gen_ai.operation.name"?: "generate_content";
  "gen_ai.provider.name"?: "gcp.gemini";
  "gen_ai.request.model"?: string;
  "gen_ai.response.finish_reasons"?: string;
  "gen_ai.usage.input_tokens"?: number;
  "gen_ai.usage.output_tokens"?: number;
  // What the call is for, such as "read this file" or "write a quiz".
  "app.ai.task"?: string;
  "http.response.status_code"?: number;
  "error.type"?: string;
};
