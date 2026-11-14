import { StartJobRequestSchema } from "@quizqrafter/shared";
import { Hono } from "hono";
import { startGenerateQuizJob, getGenerateQuizJob } from "../../core/jobs";
import type { Deps } from "../../core/types";
import type { AppEnv } from "./env";
import { parseId, parseJson, restrict, userIdOf } from "./http";

export default function jobRouter(deps: Deps) {
  const router = new Hono<AppEnv>();
  router.use("*", restrict);

  // Starts reading a document and writing its quiz, replacing the existing quiz when done.
  router.post("/", async (c) => {
    const { documentId } = await parseJson(c, StartJobRequestSchema);
    const job = await startGenerateQuizJob(deps, userIdOf(c), documentId);
    return c.json(job, 202);
  });

  router.get("/:id", async (c) => {
    const job = await getGenerateQuizJob(deps, userIdOf(c), parseId(c.req.param("id")));
    return c.json(job, 200);
  });

  return router;
}
