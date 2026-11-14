import { QuizDraftSchema, quizToMarkdown } from "@quizqrafter/shared";
import { Hono } from "hono";
import { z } from "zod";
import { renderQuizPdf } from "../../core/pdf";
import { deleteQuiz, getQuiz, updateQuiz } from "../../core/quizzes";
import { t } from "../../i18n";
import type { Deps } from "../../core/types";
import type { AppEnv } from "./env";
import { parseId, parseJson, restrict, userIdOf } from "./http";

const ExportFormatSchema = z.enum(["pdf", "markdown"]).default("pdf");

export default function quizRouter(deps: Deps) {
  const router = new Hono<AppEnv>();
  router.use("*", restrict);

  router.get("/:id", async (c) => {
    const quiz = await getQuiz(deps, userIdOf(c), parseId(c.req.param("id")));
    return c.json(quiz, 200);
  });

  router.put("/:id", async (c) => {
    const draft = await parseJson(c, QuizDraftSchema);
    const quiz = await updateQuiz(deps, userIdOf(c), parseId(c.req.param("id")), draft);
    return c.json(quiz, 200);
  });

  // Downloads the quiz as a file: ?format=pdf (default) or ?format=markdown.
  router.get("/:id/export", async (c) => {
    const format = ExportFormatSchema.parse(c.req.query("format"));
    const quiz = await getQuiz(deps, userIdOf(c), parseId(c.req.param("id")));

    if (format === "markdown") {
      return c.body(quizToMarkdown(quiz, t), 200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": "attachment; filename=quiz.md",
      });
    }
    return c.body(new Uint8Array(await renderQuizPdf(quiz)), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=quiz.pdf",
    });
  });

  router.delete("/:id", async (c) => {
    await deleteQuiz(deps, userIdOf(c), parseId(c.req.param("id")));
    return c.body(null, 204);
  });

  return router;
}
