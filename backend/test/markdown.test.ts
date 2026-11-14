import { type QuizDraft, quizToMarkdown } from "@quizqrafter/shared";
import { describe, expect, it } from "vite-plus/test";
import { t } from "../src/i18n";

const draft: QuizDraft = {
  title: "Capitals",
  questions: [
    {
      type: "multiple_choice",
      prompt: "What is the capital of France?",
      choices: ["Lyon", "Paris", "Nice"],
      answerIndex: 1,
      explanation: "Paris is the capital.",
      sourceQuote: "Paris is the capital of France.",
    },
    {
      type: "true_false",
      prompt: "Berlin is in Germany.",
      answer: true,
      explanation: "",
      sourceQuote: null,
    },
    {
      type: "short_answer",
      prompt: "Name the capital of Japan.",
      answer: "Tokyo",
      explanation: "The notes name Tokyo.",
      sourceQuote: null,
    },
  ],
};

describe("quizToMarkdown", () => {
  it("renders the questions and then the answer key", () => {
    const paris = t("export.choice", { letter: "B", choice: "Paris" });
    expect(quizToMarkdown(draft, t)).toBe(
      [
        "# Capitals",
        "",
        t("export.question", { number: 1, prompt: "What is the capital of France?" }),
        `   - ${t("export.choice", { letter: "A", choice: "Lyon" })}`,
        `   - ${paris}`,
        `   - ${t("export.choice", { letter: "C", choice: "Nice" })}`,
        "",
        t("export.question", { number: 2, prompt: "Berlin is in Germany." }),
        `   - ${t("quiz.trueAnswer")}`,
        `   - ${t("quiz.falseAnswer")}`,
        "",
        t("export.question", { number: 3, prompt: "Name the capital of Japan." }),
        "",
        `## ${t("export.answerKey")}`,
        "",
        t("export.answerWithExplanation", {
          number: 1,
          answer: paris,
          explanation: "Paris is the capital.",
        }),
        t("export.answer", { number: 2, answer: t("quiz.trueAnswer") }),
        t("export.answerWithExplanation", {
          number: 3,
          answer: "Tokyo",
          explanation: "The notes name Tokyo.",
        }),
        "",
      ].join("\n"),
    );
  });
});
