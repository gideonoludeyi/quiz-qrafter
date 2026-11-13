import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { startWorker } from "./core/worker";
import prisma from "./database";
import { createProviders } from "./providers";

const config = loadConfig();
const deps = { prisma, providers: createProviders(config) };
const app = createApp(config, deps);

const worker =
  config.worker.mode === "inline"
    ? startWorker(deps, { concurrency: config.worker.concurrency })
    : null;

const server = serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(
    `Live on PORT ${config.port} (storage: ${config.storage}, AI: ${config.ai}, worker: ${config.worker.mode})`,
  );
});

process.on("SIGTERM", () => {
  console.debug("Closing HTTP server ...");
  server.close(() => {
    console.debug("HTTP server closed");
  });
  void worker?.stop().finally(() => prisma.$disconnect());
});
