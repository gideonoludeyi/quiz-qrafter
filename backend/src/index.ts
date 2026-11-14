import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import prisma from "./database";
import { exitOnCrash, log } from "./observability/events";
import { startTelemetry } from "./observability/telemetry";
import { createProviders } from "./providers";
import { createBullQueue } from "./queue/bullmq";

const telemetry = startTelemetry("quizqrafter-api");
exitOnCrash();
const config = loadConfig();
// The API only sends GenerateQuizJobs to the queue; worker processes (`npm run worker`) run them.
const queue = createBullQueue(config.queue);
const deps = { prisma, queue, providers: createProviders(config) };
const app = createApp(config, deps);

const server = serve({ fetch: app.fetch, port: config.port }, () => {
  log("info", "API listening", { port: config.port, storage: config.storage, ai: config.ai });
});

// Once: a signal can arrive more than once, e.g. through both the process group and node --watch.
process.once("SIGTERM", () => {
  log("info", "API stopping");
  server.close(() => {
    void Promise.allSettled([queue.close(), telemetry.shutdown()]).finally(() =>
      prisma.$disconnect(),
    );
  });
});
