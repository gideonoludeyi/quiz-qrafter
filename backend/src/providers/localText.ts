import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { PermanentJobError } from "./errors";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Text that can be read on the server without an AI call, or null if the AI must read the file.
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

// A PDF's own text layer, in page order. Empty for scans, which have only images of text.
export async function readPdfText(content: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(content));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
