import path from "node:path";
import type { GoogleGenAI } from "@google/genai";
import PDFDocument from "pdfkit";
import { describe, expect, it, vi } from "vite-plus/test";
import { loadConfig } from "../src/config";
import { PermanentJobError } from "../src/providers/errors";
import { RecitationError, streamText } from "../src/providers/gemini/client";
import { GeminiTextExtractor, filePartFor } from "../src/providers/gemini/textExtractor";
import { readLocally } from "../src/providers/localText";
import { countQuestionsWritten } from "../src/providers/progress";
import { DOCX, docxWith } from "./fixtures";

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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => loadConfig({ ...local, AI: "fake", WORKER: "inline" })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/npm run worker/));
    warn.mockRestore();
  });

  it("keeps local files under backend/, wherever the process was started", () => {
    const backendDir = path.resolve(import.meta.dirname, "..");
    expect(loadConfig({ ...local, AI: "fake" }).localDataDir).toBe(path.join(backendDir, ".data"));
    expect(loadConfig({ ...local, AI: "fake", LOCAL_DATA_DIR: "/srv/qq" }).localDataDir).toBe(
      "/srv/qq",
    );
  });

  it("defaults to gemini-4-hydrogen", () => {
    expect(loadConfig({ ...local, AI: "gemini", GEMINI_API_KEY: "k" }).gemini.model).toBe(
      "gemini-4-hydrogen",
    );
  });
});

// A Gemini client whose stream yields `chunks`.
const geminiStreaming = (...chunks: object[]) =>
  ({
    models: {
      generateContentStream: async () =>
        (async function* () {
          yield* chunks;
        })(),
    },
  }) as unknown as GoogleGenAI;

const finishedWith = (finishReason: string) => ({ candidates: [{ finishReason }] });

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
