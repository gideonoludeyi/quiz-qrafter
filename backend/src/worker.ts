// Runs only the quiz job worker, for deployments that keep it apart from the API (WORKER=off there).
import { loadConfig } from "./config";
import { startWorker } from "./core/worker";
import prisma from "./database";
import { createProviders } from "./providers";

const config = loadConfig();
const worker = startWorker(
  { prisma, providers: createProviders(config) },
  { concurrency: config.worker.concurrency },
);
console.log(
  `Quiz worker running (storage: ${config.storage}, AI: ${config.ai}, concurrency: ${config.worker.concurrency})`,
);

process.on("SIGTERM", () => {
  void worker.stop().finally(() => prisma.$disconnect());
});
