import {
  ALLOWED_UPLOAD_TYPES,
  type Document,
  isJobActive,
  MAX_UPLOAD_BYTES,
  type QuizDraft,
  QuizDraftSchema,
  uploadTypeFor,
} from "@quizqrafter/shared";
import {
  RiArrowLeftLine,
  RiCloseLine,
  RiDownloadLine,
  RiRefreshLine,
  RiSaveLine,
  RiUploadLine,
} from "@remixicon/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { describeError } from "@/i18n";
import { cn } from "@/lib/utils";
import { useAuth } from "../../services/auth";
import { useDocumentAPI, useDocuments } from "../../services/document/context";
import { describeRequestError, type RequestError } from "../../services/http";
import { useQuizAPI } from "../../services/quiz/context";
import JobStatus from "../Admin/JobStatus";
import QuizEditor, { findDraftProblem } from "../Admin/QuizEditor";
import DocumentList, { StateIcon, stateOf } from "./DocumentList";
import DocumentViewer from "./DocumentViewer";
import { KindIcon, kindOf } from "./kinds";

const ACCEPT = Object.values(ALLOWED_UPLOAD_TYPES).flat().join(",");
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

type Tab = "viewer" | "quiz";

// The documents list, and a side panel showing the selected document and its quiz.
// The selection and tab live in the URL (?document=12&tab=quiz), so a reload keeps them.
const Documents = () => {
  const { store } = useDocumentAPI();
  const { documents, loadState, jobOf } = useDocuments();
  const { sessionLost } = useAuth();
  const {
    quiz,
    load,
    save,
    downloadPdf,
    clear,
    loading: quizLoading,
    error: quizError,
  } = useQuizAPI();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("document") === null ? null : Number(params.get("document"));
  const tab: Tab = params.get("tab") === "quiz" ? "quiz" : "viewer";
  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);

  const loaded = loadState.status === "loaded";
  const busy = uploading || starting || quizLoading;
  const selected = documents.find((document) => document.id === selectedId) ?? null;
  const job = selected === null ? null : jobOf(selected.id);
  const jobActive = isJobActive(job);
  // A succeeded job has nothing to show; its quiz is shown instead.
  const jobToShow = job?.status === "succeeded" ? null : job;

  // The saved quiz in draft form, to start editing from and to detect unsaved edits.
  const saved = useMemo<QuizDraft | null>(
    () => (quiz ? { title: quiz.title, questions: quiz.questions } : null),
    [quiz],
  );
  const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const navigate = useCallback(
    (documentId: number | null, nextTab: Tab) => {
      setParams(documentId === null ? {} : { document: String(documentId), tab: nextTab }, {
        replace: false,
      });
    },
    [setParams],
  );

  // On first render, load the user's documents; the store keeps them current while mounted.
  useEffect(() => {
    clear();
    return store.connect();
  }, [clear, store]);

  // A first load refused for a lost session goes back to sign-in.
  useEffect(() => {
    if (loadState.status === "failed" && loadState.error.kind === "not_signed_in") sessionLost();
  }, [loadState, sessionLost]);

  // Open whatever the URL selects, once the list is here (and again when it changes).
  const selectedKey = selected?.id ?? null;
  useEffect(() => {
    if (!loaded) return;
    const document = documents.find((candidate) => candidate.id === selectedKey) ?? null;
    if (document === null || document.quizId === null) clear();
    else void load(document.quizId);
    // Only a different selection should reload the quiz, not every list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selectedKey]);

  // Announce finished jobs, and show the new quiz if its document is open.
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  });
  useEffect(
    () =>
      store.onJobFinished((finished) => {
        if (finished.status === "succeeded") {
          toast.success("Your quiz is ready.");
          if (finished.documentId === selectedIdRef.current && finished.quizId !== null) {
            void load(finished.quizId);
          }
        } else {
          toast.error(describeError(finished.error) ?? "The quiz couldn't be made.");
        }
      }),
    [store, load],
  );

  // Tells the user why an upload or job start was refused.
  const reportRequestError = (error: RequestError, fallback: string) => {
    if (error.kind === "not_signed_in") {
      sessionLost();
    } else if (error.kind === "not_found") {
      toast.error("This document no longer exists.");
      void store.refresh();
    } else {
      if (error.kind === "http") console.error(`${fallback}:`, error);
      toast.error(describeRequestError(error, fallback));
    }
  };

  const confirmDiscard = () => !dirty || window.confirm("You have unsaved changes. Discard them?");

  const select = (document: Document) => {
    if (document.id === selectedId || !confirmDiscard()) return;
    navigate(document.id, tab);
  };

  const close = () => {
    if (confirmDiscard()) navigate(null, tab);
  };

  const handleStartJob = async (documentId: number) => {
    setStarting(true);
    const result = await store.start(documentId);
    setStarting(false);
    if (!result.ok) reportRequestError(result.error, "Could not start writing the quiz.");
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = ""; // Let the same file be chosen again.
    if (file === null) return;
    if (uploadTypeFor(file.type, file.name) === null) {
      toast.error("This file type isn't supported. Upload a PDF, image, Word or text file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`Files can be at most ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    if (!confirmDiscard()) return;

    setUploading(true);
    const result = await store.upload(file);
    setUploading(false);
    if (!result.ok) {
      reportRequestError(result.error, "Failed to upload file.");
      return;
    }
    toast.success("File uploaded. Writing your quiz…");
    // Open the new document on its quiz tab, which shows the job's progress.
    navigate(result.document.id, "quiz");
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

  const panelOpen = selected !== null;

  return (
    <div className="flex h-full min-h-0">
      {/* The list; on small screens it gives way to the open document. */}
      <section
        aria-label="Documents"
        className={cn(
          "min-w-0 flex-col",
          panelOpen ? "hidden lg:flex lg:w-[42%] lg:shrink-0 lg:border-r" : "flex flex-1",
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <h1 className="text-sm font-medium">Documents</h1>
          <span className="text-sm text-muted-foreground">{documents.length}</span>
          <label
            title={`Up to ${MAX_UPLOAD_MB} MB: PDF, image, Word, markdown or text`}
            className={buttonVariants({
              size: "sm",
              className:
                "ml-auto cursor-pointer has-disabled:pointer-events-none has-disabled:opacity-50",
            })}
          >
            <input
              type="file"
              aria-label="Upload notes"
              onChange={(event) => void handleFileChange(event)}
              className="sr-only"
              disabled={busy}
              accept={ACCEPT}
            />
            {uploading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RiUploadLine data-icon="inline-start" />
            )}
            Upload
          </label>
        </header>
        {loadState.status === "loading" ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="size-5" aria-label="Loading documents" />
          </div>
        ) : loadState.status === "failed" ? (
          <div role="alert" className="flex flex-col items-start gap-3 px-4 py-6">
            <p className="text-sm text-muted-foreground">
              {loadState.error.kind === "network"
                ? "Couldn't reach the server. Check your connection."
                : "Your documents couldn't be loaded."}
            </p>
            <Button size="sm" variant="secondary" onClick={() => void store.refresh()}>
              <RiRefreshLine data-icon="inline-start" />
              Retry
            </Button>
          </div>
        ) : (
          <DocumentList
            documents={documents}
            jobOf={jobOf}
            selectedId={selectedId}
            onSelect={select}
            disabled={busy}
          />
        )}
      </section>

      {selected !== null && (
        <Tabs
          value={tab}
          onValueChange={(value) => navigate(selected.id, value as Tab)}
          className="flex min-w-0 flex-1 flex-col gap-0"
          aria-label={selected.filename}
        >
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 lg:px-4">
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={close}
              aria-label="Back to documents"
            >
              <RiArrowLeftLine />
            </Button>
            <StateIcon state={stateOf(selected, job)} className="size-4 shrink-0" />
            <h2 className="min-w-0 truncate text-sm font-medium">{selected.filename}</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto hidden lg:inline-flex"
              onClick={close}
              aria-label="Close document"
              title="Close"
            >
              <RiCloseLine />
            </Button>
          </header>
          <div className="flex shrink-0 items-center border-b px-4 py-2">
            <TabsList>
              <TabsTrigger value="viewer">
                <KindIcon kind={kindOf(selected)} />
                Viewer
              </TabsTrigger>
              <TabsTrigger value="quiz">
                {jobActive && <Spinner aria-hidden />}
                Quiz
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="viewer" className="flex min-h-0 flex-col">
            <DocumentViewer key={selected.id} document={selected} />
          </TabsContent>

          <TabsContent value="quiz" className="flex min-h-0 flex-col">
            {draft !== null && !jobActive && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
                {dirty && <Badge variant="outline">Unsaved changes</Badge>}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Regenerating replaces this quiz, including your edits. Continue?",
                        )
                      ) {
                        void handleStartJob(selected.id);
                      }
                    }}
                  >
                    <RiRefreshLine data-icon="inline-start" />
                    Regenerate
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => downloadPdf()}
                    disabled={busy || !quiz || dirty}
                  >
                    <RiDownloadLine data-icon="inline-start" />
                    Download PDF
                  </Button>
                  <Button
                    size="sm"
                    variant={dirty ? "default" : "secondary"}
                    onClick={handleSave}
                    disabled={busy || !dirty}
                  >
                    <RiSaveLine data-icon="inline-start" />
                    Save
                  </Button>
                </div>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
                {quizError && <p className="text-sm text-destructive">{quizError}</p>}
                {jobToShow !== null && (
                  <JobStatus
                    job={jobToShow}
                    filename={selected.filename}
                    retrying={starting}
                    onRetry={() => void handleStartJob(selected.id)}
                  />
                )}
                {jobActive ? null : draft !== null ? (
                  <QuizEditor draft={draft} onChange={setDraft} />
                ) : (
                  jobToShow === null &&
                  !quizLoading && (
                    <div className="flex flex-col items-start gap-3">
                      <p className="text-sm text-muted-foreground">
                        There is no quiz for {selected.filename} yet.
                      </p>
                      <Button onClick={() => handleStartJob(selected.id)} disabled={busy}>
                        Generate quiz
                      </Button>
                    </div>
                  )
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default Documents;
