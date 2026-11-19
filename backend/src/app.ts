import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { routePath } from "hono/route";
import v1Router from "./api/v1";
import { errorHandler } from "./api/v1/http";
import { createAuth } from "./auth";
import type { Config } from "./config";
import type { Deps } from "./core/types";
import { annotate, log, withWideEvent } from "./observability/events";

// Builds the Hono app without starting a server, so tests can drive it directly.
export function createApp(config: Config, deps: Deps) {
  const auth = createAuth(config, deps);
  const app = new Hono();

  // One wide event per request. Health checks are polled too often to be worth one.
  app.use("*", async (c, next) => {
    if (c.req.path === "/healthz") return next();
    return withWideEvent("http.request", { "http.request.method": c.req.method }, async () => {
      await next();
      annotate({ "http.route": routePath(c, -1), "http.response.status_code": c.res.status });
    });
  });

  // Registered before the routes, so better-auth's responses get CORS headers too.
  app.use("*", cors({ origin: config.frontendOrigins, credentials: true }));

  app.get("/healthz", async (c) => {
    try {
      await deps.prisma.$queryRaw`SELECT 1`;
      return c.json({ database: "connected" }, 200);
    } catch (err) {
      log("error", "Database health check failed", {}, err);
      return c.json({ database: "disconnected" }, 503 /* Service Unavailable */);
    }
  });

  // Sign-up, sign-in, sign-out, sessions and password reset, under /api/auth/*.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.route("/api/v1", v1Router(auth, deps));

  // The single-page frontend: real files first, then index.html for client-side routes.
  if (config.staticDir) {
    const root = config.staticDir;
    app.use("*", async (c, next) =>
      c.req.path.startsWith("/api/") ? next() : serveStatic({ root })(c, next),
    );
    app.get("*", async (c, next) =>
      c.req.path.startsWith("/api/") ? next() : serveStatic({ root, path: "index.html" })(c, next),
    );
  }
  app.onError(errorHandler);

  return app;
}
