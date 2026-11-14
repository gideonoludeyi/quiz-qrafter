import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { annotate } from "../observability/events";
import { PermanentJobError, RecitationError } from "../providers/errors";
import type { Transcriber } from "../providers/types";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Files only the Transcriber (the AI) can read.
const TRANSCRIBED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
// Below this many non-space characters, a PDF's text layer is treated as missing (a scan).
const MIN_PDF_TEXT_CHARS = 50;

// Reads a Document's text: text and Word files here, PDFs and images through the Transcriber.
export async function readDocument(
  transcriber: Transcriber,
  content: Buffer,
  mimeType: string,
): Promise<string> {
  const local = await readLocally(content, mimeType);
  let text: string;
  if (local !== null) {
    annotate({ "app.document.read_from": "local" });
    text = local;
  } else if (TRANSCRIBED_TYPES.has(mimeType)) {
    annotate({ "app.document.read_from": "ai" });
    text = await transcribe(transcriber, content, mimeType);
  } else {
    throw new PermanentJobError(
      "This file type can't be read. Upload a PDF, image, Word or text file.",
    );
  }
  if (!text.trim()) throw new PermanentJobError("No text was found in this file.");
  return text;
}

// Text that can be read on the server without the AI, or null if the AI must read the file.
export async function readLocally(content: Buffer, mimeType: string): Promise<string | null> {
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return content.toString("utf-8");
  }
  if (mimeType === DOCX) {
    try {
      return (await mammoth.extractRawText({ buffer: content })).value;
    } catch (error) {
      throw new PermanentJobError("This Word file could not be opened.", { cause: error });
    }
  }
  return null;
}

// The AI won't copy published text, so a PDF it refuses for that is read from its own text layer.
async function transcribe(transcriber: Transcriber, content: Buffer, mimeType: string) {
  try {
    return await transcriber.transcribe(content, mimeType);
  } catch (error) {
    if (!(error instanceof RecitationError) || mimeType !== "application/pdf") throw error;
    const text = await readPdfText(content).catch(() => "");
    // A scan has no text layer to fall back on.
    if (text.replace(/\s/g, "").length < MIN_PDF_TEXT_CHARS) throw error;
    annotate({ "app.document.read_from": "pdf_text_layer", "app.ai.finish_reason": "RECITATION" });
    return text;
  }
}

// A PDF's own text layer, in page order. Empty for scans, which have only images of text.
async function readPdfText(content: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(content));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
