import type { GoogleGenAI } from "@google/genai";
import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from "@opentelemetry/sdk-trace";
import JSZip from "jszip";
import { captureOutput } from "../src/observability/events";

export const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// A minimal .docx containing one paragraph of text.
export async function docxWith(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

// Collects the wide events and log lines written until `stop` is called.
export function captureEvents() {
  const lines: Record<string, unknown>[] = [];
  const stop = captureOutput((line) => lines.push(JSON.parse(line) as Record<string, unknown>));
  const named = (event: string) => lines.filter((line) => line.event === event);
  return { lines, named, stop };
}

// A Gemini client whose stream yields `chunks`.
export const geminiStreaming = (...chunks: object[]) =>
  ({
    models: {
      generateContentStream: async () =>
        (async function* () {
          yield* chunks;
        })(),
    },
  }) as unknown as GoogleGenAI;

export const finishedWith = (finishReason: string) => ({ candidates: [{ finishReason }] });

// Records finished spans in memory until `stop`, using OpenTelemetry's global setup as the app does.
export function startTestTracing() {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(provider);
  return {
    spans: (name?: string) =>
      exporter.getFinishedSpans().filter((span) => name === undefined || span.name === name),
    reset: () => exporter.reset(),
    async stop() {
      await provider.shutdown();
      trace.disable();
      context.disable();
      propagation.disable();
    },
  };
}
