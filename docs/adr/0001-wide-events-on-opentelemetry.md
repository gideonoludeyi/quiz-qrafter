# One wide event per unit of work, on OpenTelemetry, with no logging library

Triaging a failed Job meant piecing scattered `console.*` lines together by hand. Each API request and each Run of a Job now emits one wide event. The event is built up as the work runs, and is both an OpenTelemetry span and one JSON line on stdout. Facts about the work become fields on that event, not separate log lines, so one Run's story can be found by any id it carries. Following [loggingsucks.com](https://loggingsucks.com/), the backend is reached through OpenTelemetry only, so choosing one stays a deployment decision.

## Considered options

- **Pino with wide events:** rejected. Redaction has to cover the span as well as the line, so it can't be pino's `redact`. That left pino only formatting a line, which is not worth a second dependency tree and config.
- **A vendor SDK such as Sentry:** rejected. Instrumenting with OpenTelemetry keeps the backend swappable by changing an exporter.

## Consequences

- Events carry ids, never personal data. Redaction runs before either output, and tests check it.
- Frontend error reporting is deferred until real users exist. When it comes, it covers only render and uncaught errors, sent once and linked by trace id. Network failures are never reported: nothing in them can be triaged, and the report would fail over the same network.
