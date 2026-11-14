import type { AiConfig, Config, EmailConfig, StorageConfig } from "../config";
import { ConsoleEmailSender } from "./email/consoleEmailSender";
import type { EmailSender } from "./email/types";
import { ResendEmailSender } from "./email/resendEmailSender";
import { FakeExtractor } from "./fake/fakeExtractor";
import { FakeQuizGenerator } from "./fake/fakeQuizGenerator";
import { FileBlobStore } from "./fake/fileBlobStore";
import { createGeminiClient } from "./gemini/client";
import { GeminiQuizGenerator } from "./gemini/quizGenerator";
import { GeminiTextExtractor } from "./gemini/textExtractor";
import { GcsBlobStore } from "./real/gcsBlobStore";
import type { BlobStore, Providers } from "./types";

// Builds the storage, AI and email providers that config selects.
export function createProviders(config: Config): Providers {
  return { blobs: blobStore(config.storage), email: emailSender(config.email), ...ai(config.ai) };
}

function blobStore(storage: StorageConfig): BlobStore {
  return storage.kind === "local"
    ? new FileBlobStore(storage.dir)
    : new GcsBlobStore(storage.bucket, storage.credentialsFile);
}

function emailSender(email: EmailConfig): EmailSender {
  return email.kind === "resend"
    ? new ResendEmailSender(email.apiKey, email.from)
    : new ConsoleEmailSender();
}

function ai(config: AiConfig): Pick<Providers, "extractor" | "generator"> {
  if (config.kind === "fake") {
    return {
      extractor: new FakeExtractor(config.delayMs),
      generator: new FakeQuizGenerator(config.delayMs),
    };
  }
  const client = createGeminiClient(config.apiKey);
  return {
    extractor: new GeminiTextExtractor(client, config.model),
    generator: new GeminiQuizGenerator(client, config.model),
  };
}
