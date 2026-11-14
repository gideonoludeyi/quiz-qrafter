import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { annotate, withSpan, withWideEvent } from "../src/observability/events";
import { redactText } from "../src/observability/redact";
import { PermanentJobError } from "../src/providers/errors";
import { captureEvents, startTestTracing } from "./fixtures";

describe("redactText", () => {
  it.each([
    ["an email address", "No account for ada@example.co.uk", "No account for [email]"],
    [
      "a reset link's token",
      "http://localhost:8080/api/auth/reset-password/Ab3dEf6hIj9kLm2nOp5qRs8t?callbackURL=x",
      "http://localhost:8080/api/auth/reset-password/[token]?[query]",
    ],
    [
      "a stored file's name",
      "ENOENT: open '.data/u1/8f73462c-9691-40d9-8d7e-88c6ea26f317-my diary.txt'",
      "ENOENT: open '.data/u1/8f73462c-9691-40d9-8d7e-88c6ea26f317-[filename]'",
    ],
    ["a session token", "token=k3J9xP2mQ8vR5tY7wZ1aB4cD6eF0gH", "token=[token]"],
  ])("hides %s", (_what, text, redacted) => {
    expect(redactText(text)).toBe(redacted);
  });

  it("keeps stack traces readable", () => {
    const frame =
      "at async Models.generateContentStreamWithContinuation (node_modules/@google/genai/src/models.ts:122:25)";
    expect(redactText(frame)).toBe(frame);
  });
});

describe("wide events", () => {
  it("emits one event per unit of work, with the fields added while it ran", async () => {
    const events = captureEvents();
    await withWideEvent("job.run", { "app.job.id": 7, "app.job.run": 1 }, async () => {
      annotate({ "app.generate_quiz.stage": "reading" });
      annotate({ "app.generate_quiz.stage": "writing", "app.job.outcome": "succeeded" });
    });
    events.stop();

    expect(events.lines).toEqual([
      {
        time: expect.any(String),
        level: "info",
        event: "job.run",
        duration_ms: expect.any(Number),
        "app.job.id": 7,
        "app.job.run": 1,
        "app.generate_quiz.stage": "writing",
        "app.job.outcome": "succeeded",
      },
    ]);
  });

  it("records an expected failure with its causes, but no stack", async () => {
    const events = captureEvents();
    const refusal = new PermanentJobError("The AI declined to read this file.", {
      cause: new Error("Gemini finished with RECITATION"),
    });
    await expect(
      withWideEvent("job.run", {}, async () => {
        throw refusal;
      }),
    ).rejects.toBe(refusal);
    events.stop();

    expect(events.lines[0]).toMatchObject({
      level: "error",
      "error.type": "PermanentJobError",
      "exception.message": "The AI declined to read this file.",
      "app.error.cause": "Error: Gemini finished with RECITATION",
      "app.error.expected": true,
    });
    expect(events.lines[0]).not.toHaveProperty("exception.stacktrace");
  });

  it("keeps the stack of an unexpected failure, which is likely a bug", async () => {
    const events = captureEvents();
    await withWideEvent("job.run", {}, async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'quiz')");
    }).catch(() => {});
    events.stop();

    expect(events.lines[0]).toMatchObject({
      "error.type": "TypeError",
      "app.error.expected": false,
      "exception.stacktrace": expect.stringContaining("observability.test.ts"),
    });
  });

  it("redacts what is added to an event", async () => {
    const events = captureEvents();
    await withWideEvent("http.request", {}, async () => {
      annotate({ "exception.message": "No account for ada@example.com" });
    });
    events.stop();
    expect(events.lines[0]["exception.message"]).toBe("No account for [email]");
  });

  it("ignores fields added outside any unit of work", () => {
    const events = captureEvents();
    annotate({ "app.user.id": 1 });
    events.stop();
    expect(events.lines).toEqual([]);
  });
});

describe("tracing", () => {
  let tracing: ReturnType<typeof startTestTracing>;
  beforeAll(() => {
    tracing = startTestTracing();
  });
  beforeEach(() => tracing.reset());
  afterAll(() => tracing.stop());

  it("gives each event its span's trace id, and the span the event's fields", async () => {
    const events = captureEvents();
    await withWideEvent("job.run", { "app.job.id": 7 }, async () => {
      annotate({ "app.job.outcome": "succeeded" });
    });
    events.stop();

    const [span] = tracing.spans("job.run");
    expect(events.lines[0].trace_id).toBe(span.spanContext().traceId);
    expect(span.attributes).toMatchObject({ "app.job.id": 7, "app.job.outcome": "succeeded" });
  });

  it("nests a step's span under its event, and marks it failed if it throws", async () => {
    await withWideEvent("job.run", {}, () =>
      withSpan("gemini.generate_content", { "app.ai.task": "write a quiz" }, async () => {
        throw new Error("503 overloaded");
      }),
    ).catch(() => {});

    const [run] = tracing.spans("job.run");
    const [call] = tracing.spans("gemini.generate_content");
    expect(call.parentSpanContext?.spanId).toBe(run.spanContext().spanId);
    expect(call.attributes).toMatchObject({ "app.ai.task": "write a quiz", "error.type": "Error" });
    expect(call.status.code).toBe(2); // ERROR
  });
});
