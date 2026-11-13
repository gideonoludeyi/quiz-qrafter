import type { Question, QuizDraft } from "./quiz";

const LETTERS = "ABCDEF";

// The answer as it appears in the answer key, e.g. "B. Paris" or "True".
export function formatAnswer(question: Question): string {
  switch (question.type) {
    case "multiple_choice":
      return `${LETTERS[question.answerIndex]}. ${question.choices[question.answerIndex]}`;
    case "true_false":
      return question.answer ? "True" : "False";
    case "short_answer":
      return question.answer;
  }
}

// Renders a quiz as markdown: the questions first, then an answer key.
export function quizToMarkdown(quiz: QuizDraft): string {
  const lines: string[] = [`# ${quiz.title}`, ""];

  quiz.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.prompt}`);
    if (question.type === "multiple_choice") {
      question.choices.forEach((choice, i) => lines.push(`   - ${LETTERS[i]}. ${choice}`));
    } else if (question.type === "true_false") {
      lines.push("   - True", "   - False");
    }
    lines.push("");
  });

  lines.push("## Answer Key", "");
  quiz.questions.forEach((question, index) => {
    const explanation = question.explanation ? ` — ${question.explanation}` : "";
    lines.push(`${index + 1}. ${formatAnswer(question)}${explanation}`);
  });

  return lines.join("\n") + "\n";
}
