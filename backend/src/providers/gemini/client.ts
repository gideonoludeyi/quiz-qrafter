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
import { PermanentJobError, RecitationError, TransientProviderError } from "../errors";

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

// Classifies request errors: a retry can't fix 400s, but may fix rate limits and server errors.
// Network errors are rethrown as they are, so they're retried and keep their stack.
export function classifyGeminiError(error: unknown): unknown {
  if (error instanceof ApiError && [400, 401, 403, 404].includes(error.status)) {
    return new PermanentJobError("errors.jobs.aiRejected", { cause: error });
  }
  if (error instanceof ApiError) {
    return new TransientProviderError("errors.ai.unavailable", {
      values: { status: error.status },
      cause: error,
    });
  }
  return error;
}

// A refusal shown to the user plainly; the cause records Gemini's reason, for the logs.
function refusal(
  code: string,
  reason: string,
  safetyRatings?: SafetyRating[],
  ErrorType = PermanentJobError,
) {
  const ratings = safetyRatings?.length ? `; safety ratings: ${JSON.stringify(safetyRatings)}` : "";
  return new ErrorType(code, { cause: new Error(`Gemini ${reason}${ratings}`) });
}

// `task` names the work in events; `declined` and `tooLong` are the error codes users see.
type Outcome = { task: string; declined: string; tooLong: string };

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
  { declined, tooLong }: Outcome,
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
        throw refusal(declined, `prompt blocked: ${feedback.blockReason}`, feedback.safetyRatings);
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
    throw refusal(declined, `finished with ${finishReason}`, candidate?.safetyRatings, ErrorType);
  }
  if (finishReason === FinishReason.MAX_TOKENS) throw new PermanentJobError(tooLong);
  return text;
}
