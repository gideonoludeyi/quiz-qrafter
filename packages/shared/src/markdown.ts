import type { Translate } from "./i18n";
import type { Question, QuizDraft } from "./quiz";

const LETTERS = "ABCDEF";

// The answer as it appears in the answer key, e.g. "B. Paris" or "True".
export function formatAnswer(question: Question, t: Translate): string {
  switch (question.type) {
    case "multiple_choice":
      return t("export.choice", {
        letter: LETTERS[question.answerIndex],
        choice: question.choices[question.answerIndex],
      });
    case "true_false":
      return question.answer ? t("quiz.trueAnswer") : t("quiz.falseAnswer");
    case "short_answer":
      return question.answer;
  }
}

// Renders a quiz as markdown: the questions first, then an answer key.
export function quizToMarkdown(quiz: QuizDraft, t: Translate): string {
  const lines: string[] = [`# ${quiz.title}`, ""];

  quiz.questions.forEach((question, index) => {
    lines.push(t("export.question", { number: index + 1, prompt: question.prompt }));
    if (question.type === "multiple_choice") {
      question.choices.forEach((choice, i) =>
        lines.push(`   - ${t("export.choice", { letter: LETTERS[i], choice })}`),
      );
    } else if (question.type === "true_false") {
      lines.push(`   - ${t("quiz.trueAnswer")}`, `   - ${t("quiz.falseAnswer")}`);
    }
    lines.push("");
  });

  lines.push(`## ${t("export.answerKey")}`, "");
  quiz.questions.forEach((question, index) => {
    const number = index + 1;
    const answer = formatAnswer(question, t);
    const { explanation } = question;
    lines.push(
      explanation
        ? t("export.answerWithExplanation", { number, answer, explanation })
        : t("export.answer", { number, answer }),
    );
  });

  return lines.join("\n") + "\n";
}
