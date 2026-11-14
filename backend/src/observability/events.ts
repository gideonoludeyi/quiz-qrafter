import { AsyncLocalStorage } from "node:async_hooks";
import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import type { EventFields } from "./fields";
import { redactText } from "./redact";

// Wide events: one per API request or Run, built up as it runs and emitted once at the end.

const tracer = trace.getTracer("quizqrafter");
const DEVELOPMENT = (process.env.NODE_ENV ?? "development") === "development";

type Event = { name: string; fields: EventFields; span: Span; startedAt: number };
type Scalar = string | number | boolean;

const current = new AsyncLocalStorage<Event>();

// Writes one output line. Silent in tests, which read lines through captureOutput instead.
let writeLine: (line: string, done?: () => void) => void =
  process.env.NODE_ENV === "test"
    ? (_line, done) => done?.()
    : (line, done) => void process.stdout.write(`${line}\n`, done);

// Sends output lines to `write` until the returned function is called. For tests.
export function captureOutput(write: (line: string) => void): () => void {
  const previous = writeLine;
  writeLine = (line, done) => {
    write(line);
    done?.();
  };
  return () => {
    writeLine = previous;
  };
}

// Runs `work` as one unit of work and emits its wide event when it ends, even if it throws.
export function withWideEvent<T>(
  name: string,
  fields: EventFields,
  work: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, (span) => {
    const event: Event = { name, fields: {}, span, startedAt: performance.now() };
    return current.run(event, async () => {
      annotate(fields);
      try {
        return await work();
      } catch (error) {
        recordError(error);
        throw error;
      } finally {
        finish(event);
      }
    });
  });
}

// Adds fields to the current wide event, redacted. Outside one, it does nothing.
export function annotate(fields: EventFields): void {
  const event = current.getStore();
  if (event === undefined) return;
  for (const [key, value] of Object.entries(fields) as [keyof EventFields, Scalar | undefined][]) {
    if (value === undefined) continue;
    const clean = typeof value === "string" ? redactText(value) : value;
    (event.fields as Record<string, Scalar>)[key] = clean;
    event.span.setAttribute(key, clean);
  }
}

// Records why the current unit of work failed: the error, its causes, and whether a retry could help.
export function recordError(error: unknown, retriable?: boolean): void {
  annotate({ ...errorFields(error), "app.error.retriable": retriable });
  current.getStore()?.span.setStatus({ code: SpanStatusCode.ERROR });
}

// A process lifecycle line (start, stop, crash), outside any unit of work.
export function log(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, Scalar> = {},
  error?: unknown,
  done?: () => void,
): void {
  const record: Record<string, Scalar> = { level, message: redactText(message), ...fields };
  for (const [key, value] of Object.entries(error === undefined ? {} : errorFields(error))) {
    if (value !== undefined) record[key] = redactText(value);
  }
  writeLine(format(record), done);
}

// Logs an unhandled rejection or uncaught exception, then exits, as Node would without a handler.
export function exitOnCrash(): void {
  const crash = (what: string) => (error: unknown) =>
    log("error", what, {}, error, () => process.exit(1));
  process.on("unhandledRejection", crash("Unhandled promise rejection"));
  process.on("uncaughtException", crash("Uncaught exception"));
}

function errorFields(
  error: unknown,
): Pick<
  EventFields,
  "error.type" | "exception.message" | "exception.stacktrace" | "app.error.cause"
> {
  if (!(error instanceof Error))
    return { "error.type": typeof error, "exception.message": String(error) };
  const causes: string[] = [];
  for (let cause = error.cause; cause !== undefined && causes.length < 5;) {
    causes.push(cause instanceof Error ? `${cause.name}: ${cause.message}` : JSON.stringify(cause));
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return {
    "error.type": error.name,
    "exception.message": error.message,
    "exception.stacktrace": error.stack,
    "app.error.cause": causes.length > 0 ? causes.join(" ← ") : undefined,
  };
}

function finish(event: Event): void {
  const { span, fields } = event;
  const failed =
    fields["exception.message"] !== undefined || (fields["http.response.status_code"] ?? 0) >= 500;
  const { traceId } = span.spanContext();
  writeLine(
    format({
      level: failed ? "error" : "info",
      event: event.name,
      duration_ms: Math.round(performance.now() - event.startedAt),
      ...(trace.isSpanContextValid(span.spanContext()) && { trace_id: traceId }),
      ...(fields as Record<string, Scalar>),
    }),
  );
  span.end();
}

// One JSON line, or in development a shorter line that's easier to scan, with any stack below it.
function format(record: Record<string, Scalar>): string {
  const time = new Date().toISOString();
  if (!DEVELOPMENT) return JSON.stringify({ time, ...record });
  const { level, event, message, duration_ms, "exception.stacktrace": stack, ...rest } = record;
  const head = [time.slice(11, 19), String(level).toUpperCase(), String(event ?? message)];
  if (duration_ms !== undefined) head.push(`${duration_ms}ms`);
  const tail = Object.entries(rest).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return [...head, ...tail].join(" ") + (stack === undefined ? "" : `\n${String(stack)}`);
}
