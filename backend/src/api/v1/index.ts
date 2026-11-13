import { Hono } from "hono";
import { CookieStore, sessionMiddleware } from "hono-sessions";
import type { Config } from "../../config";
import type { Deps } from "../../core/types";
import authRouter from "./auth";
import documentRouter from "./document";
import type { AppEnv } from "./env";
import jobRouter from "./jobs";
import quizRouter from "./quiz";

export default function v1Router(config: Config, deps: Deps) {
  const router = new Hono<AppEnv>();

  // The session lives in an encrypted cookie. It lasts 10 minutes, and any request,
  // including polling a job, extends it.
  router.use(
    "*",
    sessionMiddleware({
      store: new CookieStore(),
      encryptionKey: config.sessionSecret,
      expireAfterSeconds: 10 * 60,
      autoExtendExpiration: true,
      cookieOptions: {
        path: "/",
        httpOnly: true,
        sameSite: config.isProduction ? "None" : "Lax",
        secure: config.isProduction,
      },
    }),
  );

  router.route("/auth", authRouter(deps));
  router.route("/document", documentRouter(deps));
  router.route("/quiz", quizRouter(deps));
  router.route("/jobs", jobRouter(deps));

  return router;
}
