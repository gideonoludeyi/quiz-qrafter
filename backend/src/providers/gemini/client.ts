import {
  ApiError,
  FinishReason,
  type GenerateContentParameters,
  type GenerateContentResponse,
  GoogleGenAI,
  type SafetyRating,
} from "@google/genai";
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

// A refusal shown to the user plainly; the cause records Gemini's reason, for the logs.
function declined(task: string, reason: string, safetyRatings?: SafetyRating[]) {
  const ratings = safetyRatings?.length ? `; safety ratings: ${JSON.stringify(safetyRatings)}` : "";
  return new PermanentJobError(`The AI declined to ${task}.`, {
    cause: new Error(`Gemini ${reason}${ratings}`),
  });
}

type Outcome = { task: string; tooLong: string };

// Streams a response, calling `onText` with the text so far, and returns the full text.
// Fails permanently if the model declined or ran out of output tokens.
export async function streamText(
  ai: GoogleGenAI,
  params: GenerateContentParameters,
  { task, tooLong }: Outcome,
  onText?: (textSoFar: string) => void,
): Promise<string> {
  let text = "";
  let last: GenerateContentResponse | undefined;
  try {
    for await (const chunk of await ai.models.generateContentStream(params)) {
      last = chunk;
      const feedback = chunk.promptFeedback;
      if (feedback?.blockReason) {
        throw declined(task, `prompt blocked: ${feedback.blockReason}`, feedback.safetyRatings);
      }
      const piece = chunk.text;
      if (piece) {
        text += piece;
        onText?.(text);
      }
    }
  } catch (error) {
    throw classifyGeminiError(error);
  }

  const candidate = last?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (DECLINED.has(finishReason)) {
    throw declined(task, `finished with ${finishReason}`, candidate?.safetyRatings);
  }
  if (finishReason === FinishReason.MAX_TOKENS) throw new PermanentJobError(tooLong);
  return text;
}
