// Runs GenerateQuizJobs from the queue. Start as many of these processes as you need.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadConfig } from "./config";
import prisma from "./database";
import { exitOnCrash, log } from "./observability/events";
import { startTelemetry } from "./observability/telemetry";
import { createProviders } from "./providers";
import { startBullWorker } from "./queue/bullmq";

const telemetry = startTelemetry("quizqrafter-worker");
exitOnCrash();
const config = loadConfig();
const worker = await startBullWorker(
  { prisma, providers: createProviders(config) },
  { queue: config.queue, concurrency: config.worker.concurrency },
);

// A health check for deployments (and Playwright, to know the worker is up).
const health = new Hono().get("/healthz", async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    log("error", "Database health check failed", {}, error);
    return c.json({ database: "disconnected", worker: worker.isRunning() }, 503);
  }
  return c.json(
    { database: "connected", worker: worker.isRunning() },
    worker.isRunning() ? 200 : 503,
  );
});
const server = serve({ fetch: health.fetch, port: config.worker.port }, () => {
  log("info", "Quiz worker running", {
    storage: config.storage.kind,
    ai: config.ai.kind,
    concurrency: config.worker.concurrency,
    port: config.worker.port,
  });
});

// Once: a signal can arrive more than once, e.g. through both the process group and node --watch.
process.once("SIGTERM", () => {
  log("info", "Quiz worker stopping");
  server.close();
  void worker
    .stop()
    .then(() => telemetry.shutdown())
    .finally(() => prisma.$disconnect());
});
