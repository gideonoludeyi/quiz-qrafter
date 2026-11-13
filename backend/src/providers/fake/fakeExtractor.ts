import { PermanentJobError } from "../errors";
import { readLocally } from "../localText";
import type { TextExtractor } from "../types";
import { sleep } from "./sleep";

export const FAKE_SAMPLE_TEXT =
  "Photosynthesis is the process plants use to turn light into chemical energy. It takes place in the chloroplasts. The process releases oxygen as a by-product.";

// Offline extractor: reads text and Word files like the real one, and returns sample text for PDFs and images.
export class FakeExtractor implements TextExtractor {
  constructor(private readonly delayMs = 0) {}

  async extract(content: Buffer, mimeType: string): Promise<string> {
    await sleep(this.delayMs);
    const text = (await readLocally(content, mimeType)) ?? FAKE_SAMPLE_TEXT;
    if (!text.trim()) throw new PermanentJobError("No text was found in this file.");
    return text;
  }
}
