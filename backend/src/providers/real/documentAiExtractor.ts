import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import type { TextExtractor } from "../types";

type Options = {
  projectId: string;
  location: string;
  processorId: string;
  credentialsFile: string;
};

// Extracts text with Google Document AI.
export class DocumentAiExtractor implements TextExtractor {
  private readonly client: DocumentProcessorServiceClient;

  constructor(private readonly options: Options) {
    this.client = new DocumentProcessorServiceClient({ keyFile: options.credentialsFile });
  }

  async extract(content: Buffer, mimeType: string): Promise<string> {
    const { projectId, location, processorId } = this.options;
    const [result] = await this.client.processDocument({
      name: `projects/${projectId}/locations/${location}/processors/${processorId}`,
      rawDocument: { content, mimeType },
    });
    return result.document?.text ?? "";
  }
}
