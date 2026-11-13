import type { Document } from "@quizqrafter/shared";
import { RiDownloadLine, RiErrorWarningLine, RiExternalLinkLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDocumentAPI } from "../../services/document/context";
import { downloadBlob } from "../../services/http";
import { formatSize, kindLabel, kindOf } from "./kinds";

type Loaded =
  | { status: "loading" }
  | { status: "failed"; message: string }
  // `url` is an object URL for PDFs and images; `text` is set for text, markdown and Word.
  | { status: "ready"; blob: Blob | null; url: string | null; text: string | null };

// Shows a document's contents: PDFs in the browser's viewer, images, rendered markdown,
// and plain text (Word documents as their text). Give it a `key` per document, so it starts over.
const DocumentViewer = ({ document }: { document: Document }) => {
  const { service } = useDocumentAPI();
  const kind = kindOf(document);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    const load = async (): Promise<Loaded> => {
      if (kind === "word") {
        return { status: "ready", blob: null, url: null, text: await service.getText(document.id) };
      }
      const blob = await service.getFile(document.id);
      if (kind === "text" || kind === "markdown") {
        return { status: "ready", blob, url: null, text: await blob.text() };
      }
      url = URL.createObjectURL(blob);
      return { status: "ready", blob, url, text: null };
    };

    load()
      .then((next) => !cancelled && setLoaded(next))
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Loading the document failed:", error);
        setLoaded({
          status: "failed",
          message: error instanceof Error ? error.message : "The document couldn't be loaded.",
        });
      });

    return () => {
      cancelled = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [document.id, kind, service]);

  const download = async () => {
    const blob =
      loaded.status === "ready" && loaded.blob ? loaded.blob : await service.getFile(document.id);
    downloadBlob(blob, document.filename);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4 text-xs text-muted-foreground">
        <span>{kindLabel(kind)}</span>
        <span aria-hidden>·</span>
        <span>{formatSize(document.size)}</span>
        {kind === "word" && (
          <span className="hidden sm:inline">· Text only; formatting isn't shown</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {loaded.status === "ready" && loaded.url && (
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              render={<a href={loaded.url} target="_blank" rel="noreferrer" />}
              aria-label="Open in a new tab"
              title="Open in a new tab"
            >
              <RiExternalLinkLine />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void download()}
            aria-label="Download original"
            title="Download original"
          >
            <RiDownloadLine />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-muted/40" data-testid="document-viewer">
        {loaded.status === "loading" ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-5" aria-label="Loading document" />
          </div>
        ) : loaded.status === "failed" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <RiErrorWarningLine className="size-5 text-destructive" />
            {loaded.message}
          </div>
        ) : kind === "pdf" && loaded.url ? (
          <iframe title={`${document.filename} preview`} src={loaded.url} className="size-full" />
        ) : kind === "image" && loaded.url ? (
          <div className="flex min-h-full items-center justify-center p-6">
            <img
              src={loaded.url}
              alt={document.filename}
              className="max-h-full max-w-full rounded-md border bg-background object-contain shadow-sm"
            />
          </div>
        ) : kind === "markdown" ? (
          <article className="prose prose-sm mx-auto max-w-3xl px-6 py-8 dark:prose-invert">
            <Markdown remarkPlugins={[remarkGfm]}>{loaded.text ?? ""}</Markdown>
          </article>
        ) : loaded.text !== null ? (
          <pre className="mx-auto max-w-3xl px-6 py-8 font-sans text-sm leading-relaxed whitespace-pre-wrap">
            {loaded.text}
          </pre>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            This file can't be shown here. Download it to open it.
          </p>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;
