import type { Document } from "@quizqrafter/shared";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { DocumentService } from "./types";

type DocumentContextValue = {
  documents: Document[];
  loading: boolean;
  error: Error | null;
  // Resolves to the uploaded document, or null on failure (with `error` set).
  upload: (file: File) => Promise<Document | null>;
  // Reloads the document list and resolves to it (empty on failure).
  refresh: () => Promise<Document[]>;
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
        const document = await service.upload(file);
        setDocuments((current) => [document, ...current]);
        setError(null);
        return document;
      } catch (err) {
        console.error("Upload failed:", err);
        setError(err instanceof Error ? err : new Error("An unexpected error occurred"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [service],
  );

  const value = useMemo(
    () => ({ documents, loading, error, upload, refresh }),
    [documents, loading, error, upload, refresh],
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
