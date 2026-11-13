import type { Config } from "../config";
import { ConsoleEmailSender } from "./email/consoleEmailSender";
import { ResendEmailSender } from "./email/resendEmailSender";
import { FakeExtractor } from "./fake/fakeExtractor";
import { FakeQuizGenerator } from "./fake/fakeQuizGenerator";
import { FileBlobStore } from "./fake/fileBlobStore";
import { GeminiQuizGenerator } from "./gemini/quizGenerator";
import { GeminiTextExtractor } from "./gemini/textExtractor";
import { GcsBlobStore } from "./real/gcsBlobStore";
import type { Providers } from "./types";

// Builds the storage, AI and email providers that config selects.
// loadConfig has already checked that each selected provider's credentials are set.
export function createProviders(config: Config): Providers {
  const blobs =
    config.storage === "local"
      ? new FileBlobStore(config.localDataDir)
      : new GcsBlobStore(config.gcs.documentsBucket, config.gcs.credentialsFile!);

  const email =
    config.email.sender === "resend"
      ? new ResendEmailSender(config.email.resendApiKey!, config.email.from)
      : new ConsoleEmailSender();

  if (config.ai === "fake") {
    return {
      blobs,
      email,
      extractor: new FakeExtractor(config.fakeAiDelayMs),
      generator: new FakeQuizGenerator(config.fakeAiDelayMs),
    };
  }
  const apiKey = config.gemini.apiKey!;
  return {
    blobs,
    email,
    extractor: new GeminiTextExtractor(apiKey, config.gemini.model),
    generator: new GeminiQuizGenerator(apiKey, config.gemini.model),
  };
}
