// Errors here are expected: their type and message explain them, so events record them without a stack.

// A failure that retrying cannot fix. Its message is shown to the user, so keep it plain.
export class PermanentJobError extends Error {
  readonly expected = true;

  constructor(userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options);
    this.name = "PermanentJobError";
  }
}

// The AI wouldn't answer because its answer matched published text, e.g. when asked to copy a paper.
export class RecitationError extends PermanentJobError {
  override name = "RecitationError";
}

// A provider failure that a retry may fix, such as a rate limit or a 503. The cause has the details.
export class TransientProviderError extends Error {
  readonly expected = true;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TransientProviderError";
  }
}

// The model's quiz had no usable question. Writing it again usually works.
export class InvalidQuizError extends Error {
  readonly expected = true;

  constructor(problem: string) {
    super(`The model returned an invalid quiz: ${problem}`);
    this.name = "InvalidQuizError";
  }
}
