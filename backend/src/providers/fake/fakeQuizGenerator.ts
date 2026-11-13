import type { QuizDraft } from "@quizqrafter/shared";
import type { QuizGenerator } from "../types";

// Offline generator: returns a fixed quiz that quotes the document's first sentence.
export class FakeQuizGenerator implements QuizGenerator {
  async generate(documentText: string): Promise<QuizDraft> {
    const text = documentText.trim() || "The document is empty.";
    const firstSentence = text.split(/(?<=[.!?])\s+/)[0].slice(0, 200);

    return {
      title: "Sample quiz",
      questions: [
        {
          type: "multiple_choice",
          prompt: "Which sentence opens the notes?",
          choices: [firstSentence, "A sentence about volcanoes.", "A sentence about tax law."],
          answerIndex: 0,
          explanation: "It is the first sentence of the notes.",
          sourceQuote: firstSentence,
        },
        {
          type: "true_false",
          prompt: `True or false: the notes are ${text.length} characters long.`,
          answer: true,
          explanation: "The fake generator counted them.",
          sourceQuote: null,
        },
        {
          type: "short_answer",
          prompt: "What is the first word of the notes?",
          answer: text.split(/\s+/)[0],
          explanation: "It is the first word of the first sentence.",
          sourceQuote: firstSentence,
        },
      ],
    };
  }
}
