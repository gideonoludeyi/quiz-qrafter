import cors from "cors";
import express from "express";
import v1Router from "./api/v1";
import { errorHandler } from "./api/v1/http";
import type { Config } from "./config";
import type { Deps } from "./core/types";

// Builds the Express app without starting a server, so tests can drive it directly.
export function createApp(config: Config, deps: Deps) {
  const app = express();

  if (config.isProduction) {
    app.set("trust proxy", 1); // trust first proxy
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cors({ origin: config.frontendOrigins, credentials: true }));

  app.get("/healthz", (_req, res) => {
    return res.sendStatus(200);
  });

  app.use("/api/v1", v1Router(config, deps));
  app.use(errorHandler);

  return app;
}
