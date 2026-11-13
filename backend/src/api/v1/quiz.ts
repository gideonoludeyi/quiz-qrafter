import { QuizDraftSchema, quizToMarkdown } from "@quizqrafter/shared";
import { Router } from "express";
import { z } from "zod";
import { renderQuizPdf } from "../../core/pdf";
import { deleteQuiz, getQuiz, updateQuiz } from "../../core/quizzes";
import type { Deps } from "../../core/types";
import { parseId, restrict, userIdOf, wrap } from "./http";

const ExportFormatSchema = z.enum(["pdf", "markdown"]).default("pdf");

export default function quizRouter(deps: Deps) {
  const router = Router();
  router.use(restrict);

  router.get(
    "/:id",
    wrap(async (req, res) => {
      const quiz = await getQuiz(deps, userIdOf(req), parseId(req.params.id));
      return res.status(200).json(quiz);
    }),
  );

  router.put(
    "/:id",
    wrap(async (req, res) => {
      const draft = QuizDraftSchema.parse(req.body);
      const quiz = await updateQuiz(deps, userIdOf(req), parseId(req.params.id), draft);
      return res.status(200).json(quiz);
    }),
  );

  // Downloads the quiz as a file: ?format=pdf (default) or ?format=markdown.
  router.get(
    "/:id/export",
    wrap(async (req, res) => {
      const format = ExportFormatSchema.parse(req.query.format);
      const quiz = await getQuiz(deps, userIdOf(req), parseId(req.params.id));

      if (format === "markdown") {
        res.setHeader("Content-Disposition", "attachment; filename=quiz.md");
        return res.status(200).type("text/markdown").send(quizToMarkdown(quiz));
      }
      res.setHeader("Content-Disposition", "attachment; filename=quiz.pdf");
      return res
        .status(200)
        .type("application/pdf")
        .send(await renderQuizPdf(quiz));
    }),
  );

  router.delete(
    "/:id",
    wrap(async (req, res) => {
      await deleteQuiz(deps, userIdOf(req), parseId(req.params.id));
      return res.sendStatus(204 /* No Content */);
    }),
  );

  return router;
}
