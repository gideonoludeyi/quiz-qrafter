import type { TextExtractor } from "../types";

export const FAKE_SAMPLE_TEXT =
  "Photosynthesis is the process plants use to turn light into chemical energy. It takes place in the chloroplasts. The process releases oxygen as a by-product.";

// Offline extractor: decodes text files and returns sample text for anything else.
export class FakeExtractor implements TextExtractor {
  async extract(content: Buffer, mimeType: string): Promise<string> {
    if (mimeType.startsWith("text/")) return content.toString("utf-8");
    return FAKE_SAMPLE_TEXT;
  }
}
