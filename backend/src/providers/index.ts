import type { Config } from "../config";
import { FakeExtractor } from "./fake/fakeExtractor";
import { FakeQuizGenerator } from "./fake/fakeQuizGenerator";
import { FileBlobStore } from "./fake/fileBlobStore";
import { ClaudeQuizGenerator } from "./real/claudeQuizGenerator";
import { DocumentAiExtractor } from "./real/documentAiExtractor";
import { GcsBlobStore } from "./real/gcsBlobStore";
import type { Providers } from "./types";

// Builds the real or fake providers, depending on config.
export function createProviders(config: Config): Providers {
  const generator =
    config.quizGenerator === "fake"
      ? new FakeQuizGenerator()
      : new ClaudeQuizGenerator(config.anthropic.model);

  if (config.providers === "fake") {
    return {
      extractor: new FakeExtractor(),
      blobs: new FileBlobStore(config.fakeDataDir),
      generator,
    };
  }

  // loadConfig has already checked these are set when providers are real.
  const { gcloud } = config;
  return {
    extractor: new DocumentAiExtractor({
      projectId: gcloud.projectId!,
      location: gcloud.location,
      processorId: gcloud.documentProcessorId!,
      credentialsFile: gcloud.credentialsFile!,
    }),
    blobs: new GcsBlobStore(gcloud.documentsBucket, gcloud.credentialsFile!),
    generator,
  };
}
