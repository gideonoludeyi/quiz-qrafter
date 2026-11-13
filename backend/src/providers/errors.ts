// A failure that retrying cannot fix. Its message is shown to the user, so keep it plain.
export class PermanentJobError extends Error {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options);
    this.name = "PermanentJobError";
  }
}
