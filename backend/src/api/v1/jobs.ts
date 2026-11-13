import { StartJobRequestSchema } from "@quizqrafter/shared";
import { Router } from "express";
import { enqueueQuizJob, getQuizJob } from "../../core/jobs";
import type { Deps } from "../../core/types";
import { parseId, restrict, userIdOf, wrap } from "./http";

export default function jobRouter(deps: Deps) {
  const router = Router();
  router.use(restrict);

  // Starts reading a document and writing its quiz, replacing the existing quiz when done.
  router.post(
    "/",
    wrap(async (req, res) => {
      const { documentId } = StartJobRequestSchema.parse(req.body);
      const job = await enqueueQuizJob(deps, userIdOf(req), documentId);
      return res.status(202 /* Accepted */).json(job);
    }),
  );

  router.get(
    "/:id",
    wrap(async (req, res) => {
      const job = await getQuizJob(deps, userIdOf(req), parseId(req.params.id));
      return res.status(200).json(job);
    }),
  );

  return router;
}
