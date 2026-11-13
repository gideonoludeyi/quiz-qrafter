import type { Document, QuizJob } from "@quizqrafter/shared";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { DocumentService } from "./types";

type DocumentContextValue = {
  documents: Document[];
  loading: boolean;
  error: Error | null;
  // Resolves to the uploaded document and its job, or to the error (also set as `error`).
  upload: (file: File) => Promise<{ document: Document; job: QuizJob } | Error>;
  // Reloads the document list and resolves to it (empty on failure).
  refresh: () => Promise<Document[]>;
  // The service itself, for the viewer's file and text requests.
  service: DocumentService;
};

const DocumentContext = createContext<DocumentContextValue | null>(null);

type DocumentProviderProps = {
  service: DocumentService;
  children: React.ReactNode;
};

export function DocumentProvider({ service, children }: DocumentProviderProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await service.list();
      setDocuments(list);
      setError(null);
      return list;
    } catch (err) {
      console.error("Loading documents failed:", err);
      setError(err instanceof Error ? err : new Error("An unexpected error occurred"));
      return [];
    }
  }, [service]);

  const upload = useCallback(
    async (file: File) => {
      setLoading(true);
      try {
        const result = await service.upload(file);
        setDocuments((current) => [result.document, ...current]);
        setError(null);
        return result;
      } catch (err) {
        console.error("Upload failed:", err);
        const failure = err instanceof Error ? err : new Error("An unexpected error occurred");
        setError(failure);
        return failure;
      } finally {
        setLoading(false);
      }
    },
    [service],
  );

  const value = useMemo(
    () => ({ documents, loading, error, upload, refresh, service }),
    [documents, loading, error, upload, refresh, service],
  );

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>;
}

export function useDocumentAPI() {
  const documentAPI = useContext(DocumentContext);
  if (documentAPI === null)
    throw new Error(
      "useDocumentAPI() may only be used within the context of a <DocumentProvider> component.",
    );
  return documentAPI;
}
