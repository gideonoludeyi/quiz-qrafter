import type { Prisma, Question as QuestionRow } from "@prisma/client";
import { type Question, QuestionSchema, type Quiz, type QuizDraft } from "@quizqrafter/shared";
import { type Deps, NotFoundError } from "./types";

type QuizRow = Prisma.QuizGetPayload<{ include: { questions: true } }>;

const withQuestions = { questions: { orderBy: { position: "asc" } } } as const;

// Converts a shared Question into the columns of a question row.
function toQuestionData(question: Question, position: number) {
  const base = {
    position,
    type: question.type,
    prompt: question.prompt,
    explanation: question.explanation,
    sourceQuote: question.sourceQuote,
  };
  if (question.type === "multiple_choice") {
    return { ...base, choices: question.choices, answer: question.answerIndex };
  }
  return { ...base, choices: [], answer: question.answer };
}

// Converts a question row back into a validated shared Question.
function toQuestion(row: QuestionRow): Question {
  const base = {
    type: row.type,
    prompt: row.prompt,
    explanation: row.explanation,
    sourceQuote: row.sourceQuote,
  };
  return QuestionSchema.parse(
    row.type === "multiple_choice"
      ? { ...base, choices: row.choices, answerIndex: row.answer }
      : { ...base, answer: row.answer },
  );
}

function toQuiz(row: QuizRow): Quiz {
  return {
    id: row.id,
    documentId: row.documentId,
    title: row.title,
    questions: row.questions.map(toQuestion),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Finds a quiz only if it belongs to the user.
async function findOwnedQuiz({ prisma }: Deps, userId: number, quizId: number): Promise<QuizRow> {
  const row = await prisma.quiz.findFirst({
    where: { id: quizId, document: { userId } },
    include: withQuestions,
  });
  if (row === null) throw new NotFoundError("Quiz");
  return row;
}

// Stores a generated quiz for a document, replacing any existing quiz. Returns the quiz id.
export async function saveGeneratedQuiz(
  prisma: Prisma.TransactionClient,
  documentId: number,
  draft: QuizDraft,
): Promise<number> {
  const questions = { create: draft.questions.map(toQuestionData) };
  const row = await prisma.quiz.upsert({
    where: { documentId },
    create: { documentId, title: draft.title, questions },
    update: { title: draft.title, questions: { deleteMany: {}, ...questions } },
    select: { id: true },
  });
  return row.id;
}

export async function getQuiz(deps: Deps, userId: number, quizId: number): Promise<Quiz> {
  return toQuiz(await findOwnedQuiz(deps, userId, quizId));
}

// Replaces a quiz's title and questions with the given draft.
export async function updateQuiz(
  deps: Deps,
  userId: number,
  quizId: number,
  draft: QuizDraft,
): Promise<Quiz> {
  await findOwnedQuiz(deps, userId, quizId);
  const row = await deps.prisma.quiz.update({
    where: { id: quizId },
    data: {
      title: draft.title,
      questions: { deleteMany: {}, create: draft.questions.map(toQuestionData) },
    },
    include: withQuestions,
  });
  return toQuiz(row);
}

export async function deleteQuiz(deps: Deps, userId: number, quizId: number): Promise<void> {
  await findOwnedQuiz(deps, userId, quizId);
  await deps.prisma.quiz.delete({ where: { id: quizId } });
}
