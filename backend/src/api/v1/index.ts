import { Hono } from "hono";
import type { Auth } from "../../auth";
import type { Deps } from "../../core/types";
import { annotate } from "../../observability/events";
import documentRouter from "./document";
import type { AppEnv } from "./env";
import jobRouter from "./jobs";
import quizRouter from "./quiz";

export default function v1Router(auth: Auth, deps: Deps) {
  const router = new Hono<AppEnv>();

  // Looks up the better-auth session, if any; `restrict` then requires one.
  router.use("*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const userId = session ? Number(session.user.id) : undefined;
    c.set("userId", userId);
    annotate({ "app.user.id": userId });
    await next();
  });

  router.route("/document", documentRouter(deps));
  router.route("/quiz", quizRouter(deps));
  router.route("/jobs", jobRouter(deps));

  return router;
}
