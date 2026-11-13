import { createApp } from "./app";
import { loadConfig } from "./config";
import prisma from "./database";
import { createProviders } from "./providers";

const config = loadConfig();
const app = createApp(config, { prisma, providers: createProviders(config) });

const server = app.listen(config.port, () => {
  console.log(
    `Live on PORT ${config.port} (${config.providers} providers, ${config.quizGenerator} quiz generator)`,
  );
});

server.on("close", () => {
  void prisma.$disconnect();
});

process.on("SIGTERM", () => {
  console.debug("Closing HTTP server ...");
  server.close(() => {
    console.debug("HTTP server closed");
  });
});
