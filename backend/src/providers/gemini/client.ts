import {
  ApiError,
  FinishReason,
  type GenerateContentParameters,
  type GenerateContentResponse,
  GoogleGenAI,
  type SafetyRating,
} from "@google/genai";
import { annotate, withSpan } from "../../observability/events";
import type { SpanFields } from "../../observability/fields";
import { PermanentJobError } from "../errors";

// Finish reasons that mean the model declined to answer.
const DECLINED = new Set<FinishReason | undefined>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

export function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
}

// Converts request errors that a retry cannot fix into permanent job errors.
// Rate limits (429), server errors and network errors are rethrown so the job is retried.
export function classifyGeminiError(error: unknown): unknown {
  if (error instanceof ApiError && [400, 401, 403, 404].includes(error.status)) {
    return new PermanentJobError("The AI service rejected this request. Please contact support.", {
      cause: error,
    });
  }
  return error;
}

// Gemini stopped because its answer matched published text, e.g. when asked to copy a paper.
export class RecitationError extends PermanentJobError {
  override name = "RecitationError";
}

// A refusal shown to the user plainly; the cause records Gemini's reason, for the logs.
function declined(
  task: string,
  reason: string,
  safetyRatings?: SafetyRating[],
  ErrorType = PermanentJobError,
) {
  const ratings = safetyRatings?.length ? `; safety ratings: ${JSON.stringify(safetyRatings)}` : "";
  return new ErrorType(`The AI declined to ${task}.`, {
    cause: new Error(`Gemini ${reason}${ratings}`),
  });
}

type Outcome = { task: string; tooLong: string };

// Streams a response, calling `onText` with the text so far, and returns the full text.
// Fails permanently if the model declined or ran out of output tokens.
export function streamText(
  ai: GoogleGenAI,
  params: GenerateContentParameters,
  outcome: Outcome,
  onText?: (textSoFar: string) => void,
): Promise<string> {
  return withSpan(
    "gemini.generate_content",
    {
      "gen_ai.operation.name": "generate_content",
      "gen_ai.provider.name": "gcp.gemini",
      "gen_ai.request.model": params.model,
      "app.ai.task": outcome.task,
    },
    (set) => streamAndCheck(ai, params, outcome, set, onText),
  );
}

async function streamAndCheck(
  ai: GoogleGenAI,
  params: GenerateContentParameters,
  { task, tooLong }: Outcome,
  set: (fields: SpanFields) => void,
  onText?: (textSoFar: string) => void,
): Promise<string> {
  let text = "";
  let last: GenerateContentResponse | undefined;
  try {
    for await (const chunk of await ai.models.generateContentStream(params)) {
      last = chunk;
      const feedback = chunk.promptFeedback;
      if (feedback?.blockReason) {
        annotate({ "app.ai.finish_reason": `BLOCKED_${feedback.blockReason}` });
        throw declined(task, `prompt blocked: ${feedback.blockReason}`, feedback.safetyRatings);
      }
      const piece = chunk.text;
      if (piece) {
        text += piece;
        onText?.(text);
      }
    }
  } catch (error) {
    if (error instanceof ApiError) set({ "http.response.status_code": error.status });
    throw classifyGeminiError(error);
  }

  const candidate = last?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  set({
    "gen_ai.response.finish_reasons": finishReason,
    "gen_ai.usage.input_tokens": last?.usageMetadata?.promptTokenCount,
    "gen_ai.usage.output_tokens": last?.usageMetadata?.candidatesTokenCount,
  });
  if (finishReason !== undefined && finishReason !== FinishReason.STOP) {
    annotate({ "app.ai.finish_reason": finishReason });
  }
  if (DECLINED.has(finishReason)) {
    const ErrorType =
      finishReason === FinishReason.RECITATION ? RecitationError : PermanentJobError;
    throw declined(task, `finished with ${finishReason}`, candidate?.safetyRatings, ErrorType);
  }
  if (finishReason === FinishReason.MAX_TOKENS) throw new PermanentJobError(tooLong);
  return text;
}
