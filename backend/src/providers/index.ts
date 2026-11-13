import type { Config } from "../config";
import { FakeExtractor } from "./fake/fakeExtractor";
import { FakeQuizGenerator } from "./fake/fakeQuizGenerator";
import { FileBlobStore } from "./fake/fileBlobStore";
import { GeminiQuizGenerator } from "./gemini/quizGenerator";
import { GeminiTextExtractor } from "./gemini/textExtractor";
import { GcsBlobStore } from "./real/gcsBlobStore";
import type { Providers } from "./types";

// Builds the storage and AI providers that config selects.
export function createProviders(config: Config): Providers {
  const blobs =
    config.storage === "local"
      ? new FileBlobStore(config.localDataDir)
      : // loadConfig has already checked the credentials are set for gcs.
        new GcsBlobStore(config.gcs.documentsBucket, config.gcs.credentialsFile!);

  if (config.ai === "fake") {
    return {
      blobs,
      extractor: new FakeExtractor(config.fakeAiDelayMs),
      generator: new FakeQuizGenerator(config.fakeAiDelayMs),
    };
  }
  // loadConfig has already checked the API key is set for gemini.
  const apiKey = config.gemini.apiKey!;
  return {
    blobs,
    extractor: new GeminiTextExtractor(apiKey, config.gemini.model),
    generator: new GeminiQuizGenerator(apiKey, config.gemini.model),
  };
}
