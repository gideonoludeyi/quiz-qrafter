import type { AppError, TranslationValues } from "@quizqrafter/shared";
import { t } from "../i18n";

type CodedErrorOptions = { values?: TranslationValues; cause?: unknown };

// An error named by a catalogue code under errors.*. Its message is the English, for logs.
export class CodedError extends Error {
  readonly code: string;
  readonly values?: TranslationValues;

  constructor(code: string, { values, cause }: CodedErrorOptions = {}) {
    super(t(code, values), { cause });
    this.name = "CodedError";
    this.code = code;
    this.values = values;
  }

  // The code and values, for the frontend to word.
  toAppError(): AppError {
    return this.values === undefined
      ? { code: this.code }
      : { code: this.code, values: this.values };
  }
}

// The errors below are expected: their type and message explain them, so events record them without a stack.

// A failure that retrying cannot fix. Its code is shown to the user, so its message should be plain.
export class PermanentJobError extends CodedError {
  readonly expected = true;
  override name = "PermanentJobError";
}

// The AI wouldn't answer because its answer matched published text, e.g. when asked to copy a paper.
export class RecitationError extends PermanentJobError {
  override name = "RecitationError";
}

// A provider failure that a retry may fix, such as a rate limit or a 503. The cause has the details.
export class TransientProviderError extends CodedError {
  readonly expected = true;
  override name = "TransientProviderError";
}

// The model's quiz had no usable question. Writing it again usually works.
export class InvalidQuizError extends CodedError {
  readonly expected = true;
  override name = "InvalidQuizError";

  constructor(problem: string) {
    super("errors.ai.invalidQuiz", { values: { problem } });
  }
}
