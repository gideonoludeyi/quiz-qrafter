import type { Question, QuestionType } from "@quizqrafter/shared";
import { RiAddLine, RiCloseLine, RiDeleteBinLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
};

const MIN_CHOICES = 2;
const MAX_CHOICES = 6;

// Converts a question to another type, keeping the fields all types share.
function withType(question: Question, type: QuestionType): Question {
  const base = {
    prompt: question.prompt,
    explanation: question.explanation,
    sourceQuote: question.sourceQuote,
  };
  switch (type) {
    case "multiple_choice":
      return { ...base, type, choices: ["", ""], answerIndex: 0 };
    case "true_false":
      return { ...base, type, answer: true };
    case "short_answer":
      return { ...base, type, answer: "" };
  }
}

type QuestionCardProps = {
  // Zero-based position of the question in the quiz.
  index: number;
  question: Question;
  onChange: (question: Question) => void;
  onDelete: () => void;
};

// One editable question: its type, text, answer and explanation.
const QuestionCard = ({ index, question, onChange, onDelete }: QuestionCardProps) => {
  const number = index + 1;
  const id = (field: string) => `question-${number}-${field}`;

  return (
    <Card data-testid={`question-${number}`}>
      <CardHeader>
        <CardTitle>Question {number}</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete question ${number}`}
            onClick={onDelete}
          >
            <RiDeleteBinLine />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div role="group" aria-label={`Question ${number} type`} className="flex flex-wrap gap-1">
            {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => (
              <Button
                key={type}
                size="sm"
                variant={question.type === type ? "secondary" : "ghost"}
                aria-pressed={question.type === type}
                onClick={() => question.type !== type && onChange(withType(question, type))}
              >
                {TYPE_LABELS[type]}
              </Button>
            ))}
          </div>

          <Field>
            <FieldLabel htmlFor={id("prompt")}>Question</FieldLabel>
            <Textarea
              id={id("prompt")}
              value={question.prompt}
              onChange={(event) => onChange({ ...question, prompt: event.target.value })}
            />
          </Field>

          {question.type === "multiple_choice" && (
            <Field>
              <FieldLabel>Choices (select the correct one)</FieldLabel>
              <RadioGroup
                aria-label={`Correct choice for question ${number}`}
                value={String(question.answerIndex)}
                onValueChange={(value) => onChange({ ...question, answerIndex: Number(value) })}
              >
                {question.choices.map((choice, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <RadioGroupItem
                      value={String(i)}
                      aria-label={`Mark choice ${i + 1} as correct`}
                    />
                    <Input
                      aria-label={`Choice ${i + 1}`}
                      value={choice}
                      onChange={(event) =>
                        onChange({
                          ...question,
                          choices: question.choices.map((c, j) =>
                            j === i ? event.target.value : c,
                          ),
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove choice ${i + 1}`}
                      disabled={question.choices.length <= MIN_CHOICES}
                      onClick={() => {
                        const { answerIndex } = question;
                        onChange({
                          ...question,
                          choices: question.choices.filter((_, j) => j !== i),
                          // Keep pointing at the same correct choice; fall back to the first if it was removed.
                          answerIndex:
                            i < answerIndex ? answerIndex - 1 : i === answerIndex ? 0 : answerIndex,
                        });
                      }}
                    >
                      <RiCloseLine />
                    </Button>
                  </div>
                ))}
              </RadioGroup>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={question.choices.length >= MAX_CHOICES}
                  onClick={() => onChange({ ...question, choices: [...question.choices, ""] })}
                >
                  <RiAddLine data-icon="inline-start" />
                  Add choice
                </Button>
              </div>
            </Field>
          )}

          {question.type === "true_false" && (
            <Field>
              <FieldLabel>Correct answer</FieldLabel>
              <div role="group" aria-label={`Answer for question ${number}`} className="flex gap-1">
                {[true, false].map((value) => (
                  <Button
                    key={String(value)}
                    size="sm"
                    variant={question.answer === value ? "secondary" : "ghost"}
                    aria-pressed={question.answer === value}
                    onClick={() => onChange({ ...question, answer: value })}
                  >
                    {value ? "True" : "False"}
                  </Button>
                ))}
              </div>
            </Field>
          )}

          {question.type === "short_answer" && (
            <Field>
              <FieldLabel htmlFor={id("answer")}>Correct answer</FieldLabel>
              <Input
                id={id("answer")}
                value={question.answer}
                onChange={(event) => onChange({ ...question, answer: event.target.value })}
              />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor={id("explanation")}>Explanation (optional)</FieldLabel>
            <Textarea
              id={id("explanation")}
              value={question.explanation}
              onChange={(event) => onChange({ ...question, explanation: event.target.value })}
            />
          </Field>

          {question.sourceQuote && (
            <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
              From your notes: “{question.sourceQuote}”
            </blockquote>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
};

export default QuestionCard;
