import { type Document, type QuizDraft, QuizDraftSchema } from "@quizqrafter/shared";
import {
  RiDownloadLine,
  RiFileTextLine,
  RiRefreshLine,
  RiSaveLine,
  RiUploadLine,
} from "@remixicon/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDocumentAPI } from "../../services/document/context";
import { useQuizAPI } from "../../services/quiz/context";
import QuizEditor, { findDraftProblem } from "./QuizEditor";

const Quiz = () => {
  const {
    documents,
    upload,
    refresh,
    loading: uploadLoading,
    error: uploadError,
  } = useDocumentAPI();
  const {
    quiz,
    generate,
    load,
    save,
    downloadPdf,
    clear,
    loading: quizLoading,
    error: quizError,
  } = useQuizAPI();
  const [file, setFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<QuizDraft | null>(null);

  const busy = uploadLoading || quizLoading;
  const selected = documents.find((document) => document.id === selectedId) ?? null;

  // The saved quiz in draft form, to start editing from and to detect unsaved edits.
  const saved = useMemo<QuizDraft | null>(
    () => (quiz ? { title: quiz.title, questions: quiz.questions } : null),
    [quiz],
  );
  const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const openDocument = useCallback(
    async (document: Document) => {
      setSelectedId(document.id);
      if (document.quizId === null) {
        clear();
      } else {
        await load(document.quizId);
      }
    },
    [clear, load],
  );

  // On first render, load the user's documents and open the newest one.
  useEffect(() => {
    clear();
    void refresh().then((list) => {
      if (list.length > 0) void openDocument(list[0]);
    });
  }, [clear, refresh, openDocument]);

  const confirmDiscard = () => !dirty || window.confirm("You have unsaved changes. Discard them?");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
  };

  const handleGenerate = async (documentId: number) => {
    if (await generate(documentId)) {
      toast.success("Quiz ready.");
    } else {
      toast.error("Could not generate the quiz.");
    }
    await refresh();
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file to upload.");
      return;
    }
    if (!confirmDiscard()) return;

    const document = await upload(file);
    if (document === null) {
      toast.error("Failed to upload file.");
      return;
    }
    toast.success("File uploaded. Writing your quiz…");
    setFile(null);
    setSelectedId(document.id);
    clear();
    await handleGenerate(document.id);
  };

  const handleSave = async () => {
    if (draft === null) return;
    const problem = findDraftProblem(draft);
    if (problem !== null) {
      toast.error(problem);
      return;
    }
    const parsed = QuizDraftSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error("The quiz has a field that is not valid.");
      return;
    }
    if (await save(parsed.data)) {
      toast.success("Quiz saved.");
    } else {
      toast.error("Could not save the quiz.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={buttonVariants({
            variant: "outline",
            className:
              "max-w-xs cursor-pointer has-disabled:pointer-events-none has-disabled:opacity-50",
          })}
        >
          <input
            type="file"
            aria-label="Choose File"
            onChange={handleFileChange}
            className="sr-only"
            disabled={busy}
            accept=".pdf,.docx,.txt,image/*"
          />
          <span className="truncate">{file?.name ?? "Choose File"}</span>
        </label>
        <Button onClick={handleUpload} disabled={busy || !file}>
          {busy ? <Spinner data-icon="inline-start" /> : <RiUploadLine data-icon="inline-start" />}
          Upload &amp; generate
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirty && <Badge variant="outline">Unsaved changes</Badge>}
          <Button
            variant={dirty ? "default" : "secondary"}
            onClick={handleSave}
            disabled={busy || !dirty}
          >
            <RiSaveLine data-icon="inline-start" />
            Save
          </Button>
          <Button
            variant="secondary"
            onClick={() => downloadPdf()}
            disabled={busy || !quiz || dirty}
          >
            <RiDownloadLine data-icon="inline-start" />
            Download PDF
          </Button>
        </div>
      </div>

      {uploadError && (
        <p className="text-sm text-destructive">Upload error: {uploadError.message}</p>
      )}
      {quizError && <p className="text-sm text-destructive">Quiz error: {quizError.message}</p>}

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Your documents</h2>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing uploaded yet.</p>
          ) : (
            <nav aria-label="Your documents" className="flex flex-col gap-1">
              {documents.map((document) => (
                <Button
                  key={document.id}
                  variant={document.id === selectedId ? "secondary" : "ghost"}
                  className="justify-start"
                  disabled={busy}
                  onClick={() => {
                    if (document.id !== selectedId && confirmDiscard()) void openDocument(document);
                  }}
                >
                  <RiFileTextLine data-icon="inline-start" />
                  <span className="truncate">{document.filename}</span>
                </Button>
              ))}
            </nav>
          )}
          <p className="text-xs text-muted-foreground">PDF uploads must be 15 pages or less.</p>
        </aside>

        <section className="min-w-0">
          {selected === null ? (
            <p className="text-sm text-muted-foreground">
              Upload your notes to generate your first quiz.
            </p>
          ) : draft === null ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                {quizLoading
                  ? "Working on the quiz…"
                  : `There is no quiz for ${selected.filename} yet.`}
              </p>
              <Button onClick={() => handleGenerate(selected.id)} disabled={busy}>
                {quizLoading && <Spinner data-icon="inline-start" />}
                Generate quiz
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <QuizEditor draft={draft} onChange={setDraft} />
              <Button
                variant="ghost"
                className="w-fit"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Regenerating replaces this quiz, including your edits. Continue?",
                    )
                  ) {
                    void handleGenerate(selected.id);
                  }
                }}
              >
                <RiRefreshLine data-icon="inline-start" />
                Regenerate from notes
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Quiz;
