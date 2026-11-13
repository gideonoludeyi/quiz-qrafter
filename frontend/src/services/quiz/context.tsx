import type { Quiz, QuizDraft, QuizJob } from "@quizqrafter/shared";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { downloadBlob } from "../http";
import type { QuizService } from "./types";

type QuizContextValue = {
  quiz: Quiz | null;
  loading: boolean;
  error: Error | null;
  // Each action resolves to true on success; on failure it sets `error` and resolves to false.
  // Resolves to the started job, or null on failure (with `error` set).
  startJob: (documentId: number) => Promise<QuizJob | null>;
  // Fetches a job's latest state; rejects on failure without touching `error`.
  getJob: (id: number) => Promise<QuizJob>;
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
  const [error, setError] = useState<Error | null>(null);

  // Runs a service call with shared loading and error handling.
  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setLoading(true);
    try {
      await action();
      setError(null);
      return true;
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err : new Error("An error occurred"));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const startJob = useCallback(
    async (documentId: number) => {
      let job: QuizJob | null = null;
      await run(async () => {
        job = await service.startJob(documentId);
      });
      return job;
    },
    [run, service],
  );

  const getJob = useCallback((id: number) => service.getJob(id), [service]);

  const load = useCallback(
    (quizId: number) => run(async () => setQuiz(await service.get(quizId))),
    [run, service],
  );

  const save = useCallback(
    (draft: QuizDraft) =>
      run(async () => {
        if (quiz === null) throw new Error("There is no quiz to save.");
        setQuiz(await service.update(quiz.id, draft));
      }),
    [run, service, quiz],
  );

  const downloadPdf = useCallback(
    () =>
      run(async () => {
        if (quiz === null) throw new Error("There is no quiz to download.");
        downloadBlob(await service.exportPdf(quiz.id), "quiz.pdf");
      }),
    [run, service, quiz],
  );

  const clear = useCallback(() => {
    setQuiz(null);
    setError(null);
  }, []);

  const value = useMemo<QuizContextValue>(
    () => ({ quiz, loading, error, startJob, getJob, load, save, downloadPdf, clear }),
    [quiz, loading, error, startJob, getJob, load, save, downloadPdf, clear],
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
