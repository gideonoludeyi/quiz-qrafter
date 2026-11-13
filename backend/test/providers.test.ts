import { describe, expect, it, vi } from "vite-plus/test";
import { loadConfig } from "../src/config";
import { PermanentJobError } from "../src/providers/errors";
import { filePartFor } from "../src/providers/gemini/textExtractor";
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

  it("defaults to gemini-4-hydrogen", () => {
    expect(loadConfig({ ...local, AI: "gemini", GEMINI_API_KEY: "k" }).gemini.model).toBe(
      "gemini-4-hydrogen",
    );
  });
});
