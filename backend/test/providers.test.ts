import JSZip from "jszip";
import { describe, expect, it } from "vite-plus/test";
import { loadConfig } from "../src/config";
import { PermanentJobError } from "../src/providers/errors";
import { filePartFor } from "../src/providers/gemini/textExtractor";
import { readLocally } from "../src/providers/localText";
import { countQuestionsWritten } from "../src/providers/progress";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// A minimal .docx containing one paragraph of text.
async function docxWith(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

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

  it("defaults to gemini-4-hydrogen", () => {
    expect(loadConfig({ ...local, AI: "gemini", GEMINI_API_KEY: "k" }).gemini.model).toBe(
      "gemini-4-hydrogen",
    );
  });
});
