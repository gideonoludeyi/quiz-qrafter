import { context, logs, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { BatchSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export type Telemetry = { shutdown(): Promise<void> };

// Starts tracing, so events get trace ids. Exports over OTLP only when OTEL_EXPORTER_OTLP_ENDPOINT is set.
export function startTelemetry(service: "quizqrafter-api" | "quizqrafter-worker"): Telemetry {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || service,
  });
  // The exporters read the endpoint and the other standard OTEL_* settings themselves.
  const exporting = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

  const tracerProvider = new TracerProvider({
    resource,
    spanProcessors: exporting
      ? [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })]
      : [],
  });
  const loggerProvider = new LoggerProvider({
    resource,
    processors: exporting ? [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })] : [],
  });
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(tracerProvider);
  logs.setGlobalLoggerProvider(loggerProvider);

  return {
    // Sends what is still buffered, for a clean stop.
    async shutdown() {
      await Promise.all([tracerProvider.shutdown(), loggerProvider.shutdown()]);
    },
  };
}
