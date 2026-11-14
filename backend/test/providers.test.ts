import path from "node:path";
import { ApiError } from "@google/genai";
import PDFDocument from "pdfkit";
import { describe, expect, it } from "vite-plus/test";
import { loadConfig } from "../src/config";
import { PermanentJobError, TransientProviderError } from "../src/providers/errors";
import { RecitationError, classifyGeminiError, streamText } from "../src/providers/gemini/client";
import { salvageQuiz } from "../src/providers/gemini/quizGenerator";
import { GeminiTextExtractor, filePartFor } from "../src/providers/gemini/textExtractor";
import { withWideEvent } from "../src/observability/events";
import { readLocally } from "../src/providers/localText";
import { countQuestionsWritten } from "../src/providers/progress";
import {
  DOCX,
  captureEvents,
  docxWith,
  finishedWith,
  geminiStreaming,
  startTestTracing,
} from "./fixtures";

describe("readLocally", () => {
  it("decodes text and markdown without calling the AI", async () => {
    expect(await readLocally(Buffer.from("plain"), "text/plain")).toBe("plain");
    expect(await readLocally(Buffer.from("# md"), "text/markdown")).toBe("# md");
  });

  it("converts Word files locally", async () => {
    const text = await readLocally(await docxWith("Hello from Word"), DOCX);
    expect(text?.trim()).toBe("Hello from Word");
  });

  it("fails permanently on a broken Word file", async () => {
    await expect(readLocally(Buffer.from("not a zip"), DOCX)).rejects.toBeInstanceOf(
      PermanentJobError,
    );
  });

  it("leaves PDFs and images for the AI", async () => {
    expect(await readLocally(Buffer.from("%PDF"), "application/pdf")).toBeNull();
    expect(await readLocally(Buffer.from("png"), "image/png")).toBeNull();
  });
});

describe("filePartFor", () => {
  it("sends PDFs and images inline as base64", () => {
    const data = Buffer.from("bytes");
    expect(filePartFor(data, "application/pdf")).toEqual({
      inlineData: { data: data.toString("base64"), mimeType: "application/pdf" },
    });
    expect(filePartFor(data, "image/jpeg")).toEqual({
      inlineData: { data: data.toString("base64"), mimeType: "image/jpeg" },
    });
  });

  it("rejects other types permanently", () => {
    expect(() => filePartFor(Buffer.from(""), "application/zip")).toThrow(PermanentJobError);
  });
});

describe("countQuestionsWritten", () => {
  it("counts question objects started so far in partial JSON", () => {
    expect(countQuestionsWritten('{"title":"T","questions":[')).toBe(0);
    expect(
      countQuestionsWritten('{"title":"T","questions":[{"type":"true_false","prompt":"A'),
    ).toBe(1);
    expect(
      countQuestionsWritten(
        '{"questions":[{"prompt":"A","answer":true},{"type":"short_answer","prompt" :"B',
      ),
    ).toBe(2);
  });

  it("ignores the word prompt inside string values", () => {
    expect(countQuestionsWritten('{"questions":[{"prompt":"What does \\"prompt\\": mean?"')).toBe(
      1,
    );
  });
});

describe("loadConfig", () => {
  const local = { STORAGE: "local" };

  it("requires a Gemini key when AI=gemini", () => {
    expect(() => loadConfig({ ...local, AI: "gemini" })).toThrow(/GEMINI_API_KEY/);
  });

  it("rejects a Claude model name, which would fail on every request", () => {
    expect(() =>
      loadConfig({ ...local, AI: "gemini", GEMINI_API_KEY: "k", LLM_MODEL: "claude-sonnet-5-5" }),
    ).toThrow(/not a Gemini model/);
  });

  it("names the replacement for removed settings", () => {
    expect(() => loadConfig({ ...local, AI: "claude" })).toThrow(/AI=gemini/);
    expect(() => loadConfig({ ...local, ANTHROPIC_MODEL: "x" })).toThrow(/LLM_MODEL/);
  });

  it("requires a Resend key when EMAIL=resend", () => {
    expect(() => loadConfig({ ...local, AI: "fake", EMAIL: "resend" })).toThrow(/RESEND_API_KEY/);
  });

  it("names the replacement for the removed better-auth email setting", () => {
    expect(() => loadConfig({ ...local, AI: "fake", EMAIL: "betterauth" })).toThrow(/EMAIL=resend/);
  });

  it("sends from Resend's test address unless EMAIL_FROM is set", () => {
    expect(loadConfig({ ...local, AI: "fake" }).email.from).toBe(
      "Quiz Qrafter <onboarding@resend.dev>",
    );
    expect(loadConfig({ ...local, AI: "fake", EMAIL_FROM: "QQ <hi@example.com>" }).email.from).toBe(
      "QQ <hi@example.com>",
    );
  });

  it("keeps the quiz queue in the bullmq schema of DATABASE_URL's database", () => {
    const config = loadConfig({ ...local, AI: "fake", DATABASE_URL: "postgres://db/app" });
    expect(config.queue).toEqual({ databaseUrl: "postgres://db/app", schema: "bullmq" });
    expect(config.worker).toEqual({ concurrency: 2, port: 8081 });
    expect(() => loadConfig({ ...local, AI: "fake", QUEUE_SCHEMA: "bad-name" })).toThrow();
  });

  it("starts with a warning, not an error, when the old WORKER setting is set", () => {
    const events = captureEvents();
    expect(() => loadConfig({ ...local, AI: "fake", WORKER: "inline" })).not.toThrow();
    events.stop();
    expect(events.lines).toEqual([
      expect.objectContaining({ level: "warn", message: expect.stringMatching(/npm run worker/) }),
    ]);
  });

  it("needs credentials for Google Cloud Storage, and keeps them with the bucket", () => {
    expect(() => loadConfig({ STORAGE: "gcs", AI: "fake" })).toThrow(
      /GOOGLE_APPLICATION_CREDENTIALS/,
    );
    expect(
      loadConfig({ STORAGE: "gcs", AI: "fake", GOOGLE_APPLICATION_CREDENTIALS: "key.json" })
        .storage,
    ).toEqual({ kind: "gcs", bucket: "quizqrafter-documents", credentialsFile: "key.json" });
  });

  it("refuses to print reset links in production", () => {
    const production = {
      ...local,
      AI: "fake",
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "s".repeat(32),
    };
    expect(() => loadConfig(production)).toThrow(/EMAIL=console/);
    expect(
      loadConfig({ ...production, EMAIL: "resend", RESEND_API_KEY: "re_k" }).email,
    ).toMatchObject({
      kind: "resend",
      apiKey: "re_k",
    });
  });

  it("keeps local files under backend/, wherever the process was started", () => {
    const backendDir = path.resolve(import.meta.dirname, "..");
    expect(loadConfig({ ...local, AI: "fake" }).storage).toEqual({
      kind: "local",
      dir: path.join(backendDir, ".data"),
    });
    expect(loadConfig({ ...local, AI: "fake", LOCAL_DATA_DIR: "/srv/qq" }).storage).toEqual({
      kind: "local",
      dir: "/srv/qq",
    });
  });

  it("defaults to gemini-4-hydrogen", () => {
    expect(loadConfig({ ...local, AI: "gemini", GEMINI_API_KEY: "k" }).ai).toEqual({
      kind: "gemini",
      apiKey: "k",
      model: "gemini-4-hydrogen",
    });
  });
});

describe("streamText", () => {
  const outcome = { task: "read this file", tooLong: "Too long." };

  it("shows the user a plain refusal and keeps Gemini's reason for the logs", async () => {
    const ai = geminiStreaming(
      { text: "Chapter 1" },
      {
        candidates: [
          {
            finishReason: "RECITATION",
            safetyRatings: [{ category: "HARM_CATEGORY_HARASSMENT", probability: "NEGLIGIBLE" }],
          },
        ],
      },
    );
    const error = await streamText(ai, { model: "m", contents: [] }, outcome).catch((e) => e);
    expect(error).toBeInstanceOf(PermanentJobError);
    expect(error.message).toBe("The AI declined to read this file.");
    expect(error.cause.message).toMatch(/finished with RECITATION; safety ratings: .*HARASSMENT/);
  });

  it("records each call as a span with its model, finish reason and token counts", async () => {
    const tracing = startTestTracing();
    try {
      const ai = geminiStreaming(
        { text: "All of it" },
        {
          candidates: [{ finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 },
        },
      );
      await streamText(ai, { model: "gemini-test", contents: [] }, outcome);
      expect(tracing.spans("gemini.generate_content")[0].attributes).toEqual({
        "gen_ai.operation.name": "generate_content",
        "gen_ai.provider.name": "gcp.gemini",
        "gen_ai.request.model": "gemini-test",
        "app.ai.task": "read this file",
        "gen_ai.response.finish_reasons": "STOP",
        "gen_ai.usage.input_tokens": 120,
        "gen_ai.usage.output_tokens": 30,
      });
    } finally {
      await tracing.stop();
    }
  });

  it("keeps the reason when Gemini blocks the prompt", async () => {
    const ai = geminiStreaming({ promptFeedback: { blockReason: "OTHER" } });
    const error = await streamText(ai, { model: "m", contents: [] }, outcome).catch((e) => e);
    expect(error.message).toBe("The AI declined to read this file.");
    expect(error.cause.message).toBe("Gemini prompt blocked: OTHER");
  });
});

// A one-page PDF with `text` as its text layer, or a blank page, like a scan's text layer.
async function pdfWith(text: string): Promise<Buffer> {
  const doc = new PDFDocument();
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise((resolve) => doc.on("end", resolve));
  if (text) doc.text(text);
  doc.end();
  await ended;
  return Buffer.concat(chunks);
}

describe("GeminiTextExtractor", () => {
  const PAPER =
    "Ant colony optimisation finds short paths by laying and following pheromone trails.";
  const extractorAnswering = (...chunks: object[]) =>
    new GeminiTextExtractor(geminiStreaming(...chunks), "gemini-test");

  it("reads a PDF's own text when Gemini won't copy it", async () => {
    const extractor = extractorAnswering({ text: "Ant colony" }, finishedWith("RECITATION"));
    const text = await extractor.extract(await pdfWith(PAPER), "application/pdf");
    expect(text.replace(/\s+/g, " ")).toContain(PAPER);
  });

  it("keeps the refusal for a scanned PDF, which has no text to read", async () => {
    const extractor = extractorAnswering(finishedWith("RECITATION"));
    await expect(extractor.extract(await pdfWith(""), "application/pdf")).rejects.toBeInstanceOf(
      RecitationError,
    );
  });

  it("keeps any other refusal, even for a PDF with text", async () => {
    const extractor = extractorAnswering(finishedWith("SAFETY"));
    await expect(extractor.extract(await pdfWith(PAPER), "application/pdf")).rejects.toThrow(
      "The AI declined to read this file.",
    );
  });
});

describe("classifyGeminiError", () => {
  it("turns a rate limit or server error into an expected, retriable failure", () => {
    const busy = new ApiError({ message: "high demand", status: 503 });
    const classified = classifyGeminiError(busy);
    expect(classified).toBeInstanceOf(TransientProviderError);
    expect(classified).toMatchObject({
      message: "Gemini returned 503.",
      cause: busy,
      expected: true,
    });
  });

  it("leaves a network error as it is, keeping its stack", () => {
    const offline = new TypeError("fetch failed");
    expect(classifyGeminiError(offline)).toBe(offline);
  });
});

describe("salvageQuiz", () => {
  const question = { prompt: "Q", explanation: "", sourceQuote: null };
  const choiceQuestion = (choices: string[], answerIndex: number) => ({
    type: "multiple_choice",
    ...question,
    choices,
    answerIndex,
  });

  it("removes blank choices and keeps the answer on the same choice", () => {
    // Like a quiz Gemini returned: the second and fourth choices empty, the answer last.
    const quiz = salvageQuiz({
      title: "Cells",
      questions: [choiceQuestion(["ATP", "", "DNA", "  ", "Mitochondria"], 4)],
    });
    expect(quiz.questions).toEqual([choiceQuestion(["ATP", "DNA", "Mitochondria"], 2)]);
  });

  it("drops a question it can't repair, and records what it did", async () => {
    const events = captureEvents();
    const quiz = await withWideEvent("job.run", {}, async () =>
      salvageQuiz({
        title: "Cells",
        questions: [
          choiceQuestion(["", "DNA", "RNA"], 0), // The correct choice is the blank one.
          { type: "true_false", ...question, answer: true },
        ],
      }),
    );
    events.stop();

    expect(quiz.questions).toEqual([{ type: "true_false", ...question, answer: true }]);
    expect(events.lines[0]).toMatchObject({
      "app.generate_quiz.blank_choices_removed": 1,
      "app.generate_quiz.questions_dropped": 1,
    });
  });

  it("fails, so the Run is retried, when no question is usable", () => {
    expect(() => salvageQuiz({ title: "Cells", questions: [choiceQuestion(["", ""], 0)] })).toThrow(
      "The model returned an invalid quiz: no usable questions",
    );
    expect(() => salvageQuiz({ questions: [] })).toThrow("The model returned an invalid quiz");
  });
});
