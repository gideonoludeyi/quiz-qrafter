import type { Question, QuizDraft } from "@quizqrafter/shared";
import { RiAddLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import QuestionCard from "./QuestionCard";

const NEW_QUESTION: Question = {
  type: "multiple_choice",
  prompt: "",
  choices: ["", ""],
  answerIndex: 0,
  explanation: "",
  sourceQuote: null,
};

// Returns the first problem that would stop a draft from saving, or null if it is ready.
export function findDraftProblem(draft: QuizDraft): string | null {
  if (!draft.title.trim()) return "The quiz needs a title.";
  for (const [index, question] of draft.questions.entries()) {
    const label = `Question ${index + 1}`;
    if (!question.prompt.trim()) return `${label} needs question text.`;
    if (question.type === "multiple_choice" && question.choices.some((choice) => !choice.trim())) {
      return `${label} has an empty choice.`;
    }
    if (question.type === "short_answer" && !question.answer.trim()) {
      return `${label} needs a correct answer.`;
    }
  }
  return null;
}

type QuizEditorProps = {
  draft: QuizDraft;
  onChange: (draft: QuizDraft) => void;
};

// Edits a quiz's title and questions. The parent owns the draft and saves it.
const QuizEditor = ({ draft, onChange }: QuizEditorProps) => {
  const setQuestions = (questions: Question[]) => onChange({ ...draft, questions });

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="quiz-title">Quiz title</FieldLabel>
        <Input
          id="quiz-title"
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </Field>

      {draft.questions.map((question, index) => (
        <QuestionCard
          key={index}
          index={index}
          question={question}
          onChange={(updated) =>
            setQuestions(draft.questions.map((q, i) => (i === index ? updated : q)))
          }
          onDelete={() => setQuestions(draft.questions.filter((_, i) => i !== index))}
        />
      ))}

      <Button
        variant="outline"
        className="w-fit"
        onClick={() => setQuestions([...draft.questions, NEW_QUESTION])}
      >
        <RiAddLine data-icon="inline-start" />
        Add question
      </Button>
    </div>
  );
};

export default QuizEditor;
