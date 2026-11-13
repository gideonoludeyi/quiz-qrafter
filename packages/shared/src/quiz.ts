import { z } from "zod";

const questionBase = {
  prompt: z.string().trim().min(1),
  explanation: z.string(),
  // The sentence in the source notes that supports the answer, if known.
  sourceQuote: z.string().nullable(),
};

export const MultipleChoiceQuestionSchema = z
  .object({
    type: z.literal("multiple_choice"),
    ...questionBase,
    choices: z.array(z.string().trim().min(1)).min(2).max(6),
    answerIndex: z.number().int().min(0),
  })
  .refine((q) => q.answerIndex < q.choices.length, {
    message: "answerIndex must point at one of the choices",
    path: ["answerIndex"],
  });

export const TrueFalseQuestionSchema = z.object({
  type: z.literal("true_false"),
  ...questionBase,
  answer: z.boolean(),
});

export const ShortAnswerQuestionSchema = z.object({
  type: z.literal("short_answer"),
  ...questionBase,
  answer: z.string().trim().min(1),
});

export const QuestionSchema = z.union([
  MultipleChoiceQuestionSchema,
  TrueFalseQuestionSchema,
  ShortAnswerQuestionSchema,
]);

export const QUESTION_TYPES = ["multiple_choice", "true_false", "short_answer"] as const;
export const QuestionTypeSchema = z.enum(QUESTION_TYPES);

// A quiz without server-assigned fields: the model's output and the save request body.
export const QuizDraftSchema = z.object({
  title: z.string().trim().min(1),
  questions: z.array(QuestionSchema).max(100),
});

export const QuizSchema = QuizDraftSchema.extend({
  id: z.number().int(),
  documentId: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const GenerateQuizRequestSchema = z.object({
  documentId: z.number().int(),
});

export type MultipleChoiceQuestion = z.infer<typeof MultipleChoiceQuestionSchema>;
export type TrueFalseQuestion = z.infer<typeof TrueFalseQuestionSchema>;
export type ShortAnswerQuestion = z.infer<typeof ShortAnswerQuestionSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type QuizDraft = z.infer<typeof QuizDraftSchema>;
export type Quiz = z.infer<typeof QuizSchema>;
