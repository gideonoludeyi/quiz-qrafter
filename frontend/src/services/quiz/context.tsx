import type { Quiz, QuizDraft } from "@quizqrafter/shared";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { describeRequestError, downloadBlob, type RequestResult } from "../http";
import type { QuizService } from "./types";

type QuizContextValue = {
  quiz: Quiz | null;
  loading: boolean;
  // Why the last action failed, in words for the user.
  error: string | null;
  // Each action resolves to true on success; on failure it sets `error` and resolves to false.
  // A lost session signs the user out instead.
  load: (quizId: number) => Promise<boolean>;
  save: (draft: QuizDraft) => Promise<boolean>;
  downloadPdf: () => Promise<boolean>;
  clear: () => void;
};

const QuizContext = createContext<QuizContextValue | null>(null);

type QuizProviderProps = {
  service: QuizService;
  children: React.ReactNode;
};

export function QuizProvider({ service, children }: QuizProviderProps) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { sessionLost } = useAuth();

  // Runs a service call with shared loading and error handling, passing its value to `use`.
  const run = useCallback(
    async <T,>(
      call: () => Promise<RequestResult<T>>,
      use: (value: T) => void,
      fallback: string,
    ): Promise<boolean> => {
      setLoading(true);
      const result = await call();
      setLoading(false);
      if (result.ok) {
        use(result.value);
        setError(null);
        return true;
      }
      if (result.error.kind === "not_signed_in") {
        sessionLost();
      } else {
        if (result.error.kind === "http") console.error(`${fallback}:`, result.error);
        setError(describeRequestError(result.error, fallback));
      }
      return false;
    },
    [sessionLost],
  );

  const load = useCallback(
    (quizId: number) => run(() => service.get(quizId), setQuiz, "The quiz couldn't be loaded."),
    [run, service],
  );

  const save = useCallback(
    async (draft: QuizDraft) =>
      quiz !== null &&
      run(() => service.update(quiz.id, draft), setQuiz, "The quiz couldn't be saved."),
    [run, service, quiz],
  );

  const downloadPdf = useCallback(
    async () =>
      quiz !== null &&
      run(
        () => service.exportPdf(quiz.id),
        (pdf) => downloadBlob(pdf, "quiz.pdf"),
        "The PDF couldn't be downloaded.",
      ),
    [run, service, quiz],
  );

  const clear = useCallback(() => {
    setQuiz(null);
    setError(null);
  }, []);

  const value = useMemo<QuizContextValue>(
    () => ({ quiz, loading, error, load, save, downloadPdf, clear }),
    [quiz, loading, error, load, save, downloadPdf, clear],
  );

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}

export function useQuizAPI() {
  const quizAPI = useContext(QuizContext);
  if (!quizAPI) {
    throw new Error("useQuizAPI must be used within a QuizProvider.");
  }
  return quizAPI;
}
