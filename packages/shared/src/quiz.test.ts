import { describe, expect, it } from "vite-plus/test";
import { QuestionSchema, type QuizDraft, QuizDraftSchema } from "./quiz";

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

describe("QuizDraftSchema", () => {
  it("accepts one question of each type", () => {
    expect(QuizDraftSchema.parse(draft)).toEqual(draft);
  });

  it("rejects an answerIndex outside the choices", () => {
    const question = { ...draft.questions[0], answerIndex: 3 };
    expect(QuestionSchema.safeParse(question).success).toBe(false);
  });

  it("rejects a multiple choice question with one choice", () => {
    const question = { ...draft.questions[0], choices: ["Paris"], answerIndex: 0 };
    expect(QuestionSchema.safeParse(question).success).toBe(false);
  });

  it("rejects an unknown question type", () => {
    const question = { ...draft.questions[1], type: "essay" };
    expect(QuestionSchema.safeParse(question).success).toBe(false);
  });

  it("rejects an empty title or prompt", () => {
    expect(QuizDraftSchema.safeParse({ ...draft, title: " " }).success).toBe(false);
    const question = { ...draft.questions[2], prompt: "" };
    expect(QuestionSchema.safeParse(question).success).toBe(false);
  });
});
