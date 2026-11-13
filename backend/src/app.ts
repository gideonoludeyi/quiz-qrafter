import { Hono } from "hono";
import { cors } from "hono/cors";
import v1Router from "./api/v1";
import { errorHandler } from "./api/v1/http";
import { createAuth } from "./auth";
import type { Config } from "./config";
import type { Deps } from "./core/types";

// Builds the Hono app without starting a server, so tests can drive it directly.
export function createApp(config: Config, deps: Deps) {
  const auth = createAuth(config, deps);
  const app = new Hono();

  // Registered before the routes, so better-auth's responses get CORS headers too.
  app.use("*", cors({ origin: config.frontendOrigins, credentials: true }));

  app.get("/healthz", async (c) => {
    try {
      await deps.prisma.$queryRaw`SELECT 1`;
      return c.json({ database: "connected" }, 200);
    } catch (err) {
      console.error("Database health check failed:", err);
      return c.json({ database: "disconnected" }, 503 /* Service Unavailable */);
    }
  });

  // Sign-up, sign-in, sign-out, sessions and password reset, under /api/auth/*.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.route("/api/v1", v1Router(auth, deps));
  app.onError(errorHandler);

  return app;
}
