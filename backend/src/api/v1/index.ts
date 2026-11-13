import RedisStore from "connect-redis";
import { Router } from "express";
import session, { MemoryStore, type Store } from "express-session";
import { createClient } from "redis";
import type { Config } from "../../config";
import type { Deps } from "../../core/types";
import authRouter from "./auth";
import documentRouter from "./document";
import jobRouter from "./jobs";
import quizRouter from "./quiz";

// Sessions live in Redis when REDIS_URL is set, otherwise in memory.
function createSessionStore(redisUrl: string | undefined): Store {
  if (redisUrl === undefined) return new MemoryStore();

  const redisClient = createClient({ url: redisUrl });
  redisClient.on("error", (err) => {
    console.error(`Could not establish a connection with redis. ${err}`);
  });
  redisClient.on("connect", () => {
    console.log("Connected to redis successfully");
  });
  redisClient.connect().catch((err) => console.error(err));
  return new RedisStore({ client: redisClient });
}

export default function v1Router(config: Config, deps: Deps) {
  const router = Router();

  router.use(
    session({
      store: createSessionStore(config.redisUrl),
      resave: false, // don't save session if unmodified
      rolling: true, // any request, including polling a job, extends the session
      saveUninitialized: false,
      secret: config.sessionSecret,
      cookie: {
        maxAge: 10 * 60 * 1000, // 10 minutes
        sameSite: config.isProduction ? "none" : undefined,
        secure: config.isProduction,
      },
    }),
  );

  router.use("/auth", authRouter(deps));
  router.use("/document", documentRouter(deps));
  router.use("/quiz", quizRouter(deps));
  router.use("/jobs", jobRouter(deps));

  return router;
}
