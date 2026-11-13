import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import prisma from "./database";
import { createProviders } from "./providers";
import { createQuizQueue } from "./queue";

const config = loadConfig();
// The API only sends quiz jobs to the queue; worker processes (`npm run worker`) run them.
const queue = createQuizQueue(config.queue);
const deps = { prisma, queue, providers: createProviders(config) };
const app = createApp(config, deps);

const server = serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`Live on PORT ${config.port} (storage: ${config.storage}, AI: ${config.ai})`);
});

process.on("SIGTERM", () => {
  console.debug("Closing HTTP server ...");
  server.close(() => {
    console.debug("HTTP server closed");
    void queue.close().finally(() => prisma.$disconnect());
  });
});
