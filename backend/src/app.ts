import { Hono } from "hono";
import { cors } from "hono/cors";
import v1Router from "./api/v1";
import { errorHandler, sendStatus } from "./api/v1/http";
import type { Config } from "./config";
import type { Deps } from "./core/types";

// Builds the Hono app without starting a server, so tests can drive it directly.
export function createApp(config: Config, deps: Deps) {
  const app = new Hono();

  app.use("*", cors({ origin: config.frontendOrigins, credentials: true }));

  app.get("/healthz", (c) => sendStatus(c, 200));

  app.route("/api/v1", v1Router(config, deps));
  app.onError(errorHandler);

  return app;
}
