import type { QuizDraft } from "@quizqrafter/shared";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vite-plus/test";
import { renderQuizPdf } from "../src/core/pdf";

// Text a quiz from technical notes can contain: Greek letters, subscripts, math symbols, accents.
const UNICODE_QUIZ: QuizDraft = {
  title: "Particle Swarm Optimization: Fundamentals",
  questions: [
    {
      type: "multiple_choice",
      prompt: "Which parameter values did van den Bergh show lead to convergence?",
      choices: ["ω = 0.7298, c₁ = c₂ = 1.49618", "φ ≤ 4 and χ ≈ 0.73", "w ∈ [0, 1], c₁ + c₂ < 4"],
      answerIndex: 0,
      explanation: "With φ = c₁ + c₂ > 4, the constriction factor χ keeps velocities bounded.",
      sourceQuote: null,
    },
    {
      type: "short_answer",
      prompt: "Who described the « inertia weight » for Poincaré-style analyses?",
      answer: "Shi and Eberhart",
      explanation: "",
      sourceQuote: null,
    },
  ],
};

async function pdfText(quiz: QuizDraft): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(await renderQuizPdf(quiz)));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/\s+/g, " ");
}

describe("renderQuizPdf", () => {
  it("keeps Greek letters, subscripts and math symbols readable", async () => {
    const text = await pdfText(UNICODE_QUIZ);
    expect(text).toContain("ω = 0.7298, c₁ = c₂ = 1.49618");
    expect(text).toContain("φ ≤ 4 and χ ≈ 0.73");
    expect(text).toContain("w ∈ [0, 1], c₁ + c₂ < 4");
    expect(text).toContain("the constriction factor χ keeps velocities bounded");
    expect(text).toContain("« inertia weight » for Poincaré-style");
  });

  it("puts the questions first and the answer key on its own page", async () => {
    const pdf = await getDocumentProxy(new Uint8Array(await renderQuizPdf(UNICODE_QUIZ)));
    const { text: pages } = await extractText(pdf);
    expect(pages.at(-1)).toContain("Answer Key");
    expect(pages[0]).not.toContain("Answer Key");
  });
});
