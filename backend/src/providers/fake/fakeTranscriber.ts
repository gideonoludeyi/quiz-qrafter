import type { Transcriber } from "../types";
import { sleep } from "./sleep";

export const FAKE_SAMPLE_TEXT =
  "Photosynthesis is the process plants use to turn light into chemical energy. It takes place in the chloroplasts. The process releases oxygen as a by-product.";

// Offline transcriber: every PDF or image reads as the same sample text.
export class FakeTranscriber implements Transcriber {
  constructor(private readonly delayMs = 0) {}

  async transcribe(): Promise<string> {
    await sleep(this.delayMs);
    return FAKE_SAMPLE_TEXT;
  }
}
