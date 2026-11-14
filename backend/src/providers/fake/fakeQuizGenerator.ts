import type { QuizDraft } from "@quizqrafter/shared";
import { PermanentJobError } from "../errors";
import type { QuizGenerator } from "../types";
import { sleep } from "./sleep";

// Notes containing this marker make the fake generator fail, to test the failure path.
export const FAKE_FAIL_MARKER = "FAKE_FAIL";

// Offline generator: returns a fixed quiz that quotes the document's first sentence.
export class FakeQuizGenerator implements QuizGenerator {
  constructor(private readonly delayMs = 0) {}

  async generate(
    documentText: string,
    onProgress?: (questionsWritten: number) => void,
  ): Promise<QuizDraft> {
    if (documentText.includes(FAKE_FAIL_MARKER)) {
      await sleep(this.delayMs);
      throw new PermanentJobError("errors.jobs.fakeFailure");
    }

    const quiz = this.quizFor(documentText);
    // Report questions one at a time, like a streamed Gemini response.
    for (let written = 1; written <= quiz.questions.length; written++) {
      await sleep(this.delayMs);
      onProgress?.(written);
    }
    return quiz;
  }

  private quizFor(documentText: string): QuizDraft {
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
