import type { Document } from "@quizqrafter/shared";
import { RiDownloadLine, RiErrorWarningLine, RiExternalLinkLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { t } from "@/i18n";
import { useDocumentAPI } from "../../services/document/context";
import { useAuth } from "../../services/auth";
import {
  describeRequestError,
  downloadBlob,
  type RequestError,
  type RequestResult,
} from "../../services/http";
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
  const { sessionLost } = useAuth();
  const kind = kindOf(document);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    const load = async (): Promise<RequestResult<Loaded>> => {
      if (kind === "word") {
        const text = await service.getText(document.id);
        return text.ok
          ? { ok: true, value: { status: "ready", blob: null, url: null, text: text.value } }
          : text;
      }
      const file = await service.getFile(document.id);
      if (!file.ok) return file;
      const blob = file.value;
      if (kind === "text" || kind === "markdown") {
        return { ok: true, value: { status: "ready", blob, url: null, text: await blob.text() } };
      }
      url = URL.createObjectURL(blob);
      return { ok: true, value: { status: "ready", blob, url, text: null } };
    };

    void load().then((result) => {
      if (cancelled) return;
      if (result.ok) return setLoaded(result.value);
      const failed = failure(result.error, t("documents.viewer.loadFailed"));
      if (failed !== null) setLoaded(failed);
    });

    return () => {
      cancelled = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
    // failure only reads sessionLost, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id, kind, service]);

  // A failed load to show, or null when a lost session sends the user to sign in instead.
  function failure(error: RequestError, fallback: string): Loaded | null {
    if (error.kind === "not_signed_in") {
      sessionLost();
      return null;
    }
    if (error.kind === "http") console.error(`${fallback}:`, error);
    return { status: "failed", message: describeRequestError(error, fallback) };
  }

  const download = async () => {
    if (loaded.status === "ready" && loaded.blob)
      return downloadBlob(loaded.blob, document.filename);
    const file = await service.getFile(document.id);
    if (file.ok) downloadBlob(file.value, document.filename);
    else {
      const failed = failure(file.error, t("documents.viewer.downloadFailed"));
      if (failed !== null) setLoaded(failed);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4 text-xs text-muted-foreground">
        <span>{kindLabel(kind)}</span>
        <span aria-hidden>·</span>
        <span>{formatSize(document.size)}</span>
        {kind === "word" && (
          <span className="hidden sm:inline">· {t("documents.viewer.wordTextOnly")}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {loaded.status === "ready" && loaded.url && (
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              render={<a href={loaded.url} target="_blank" rel="noreferrer" />}
              aria-label={t("documents.viewer.openInNewTab")}
              title={t("documents.viewer.openInNewTab")}
            >
              <RiExternalLinkLine />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void download()}
            aria-label={t("documents.viewer.downloadOriginal")}
            title={t("documents.viewer.downloadOriginal")}
          >
            <RiDownloadLine />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-muted/40" data-testid="document-viewer">
        {loaded.status === "loading" ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-5" aria-label={t("documents.viewer.loading")} />
          </div>
        ) : loaded.status === "failed" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <RiErrorWarningLine className="size-5 text-destructive" />
            {loaded.message}
          </div>
        ) : kind === "pdf" && loaded.url ? (
          <iframe
            title={t("documents.viewer.previewTitle", { filename: document.filename })}
            src={loaded.url}
            className="size-full"
          />
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
          <p className="p-6 text-sm text-muted-foreground">{t("documents.viewer.cantShow")}</p>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;
