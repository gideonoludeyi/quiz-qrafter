// Runs quiz jobs from the queue. Start as many of these processes as you need.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadConfig } from "./config";
import { startWorker } from "./core/worker";
import prisma from "./database";
import { createProviders } from "./providers";

const config = loadConfig();
const worker = await startWorker(
  { prisma, providers: createProviders(config) },
  { queue: config.queue, concurrency: config.worker.concurrency },
);

// A health check for deployments (and Playwright, to know the worker is up).
const health = new Hono().get("/healthz", async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("Database health check failed:", error);
    return c.json({ database: "disconnected", worker: worker.isRunning() }, 503);
  }
  return c.json(
    { database: "connected", worker: worker.isRunning() },
    worker.isRunning() ? 200 : 503,
  );
});
const server = serve({ fetch: health.fetch, port: config.worker.port }, () => {
  console.log(
    `Quiz worker running (storage: ${config.storage}, AI: ${config.ai}, concurrency: ${config.worker.concurrency}, health: ${config.worker.port})`,
  );
});

process.on("SIGTERM", () => {
  server.close();
  void worker.stop().finally(() => prisma.$disconnect());
});
