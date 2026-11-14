import type { GenerateQuizJob } from "@quizqrafter/shared";
import React, { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { createDocumentsStore, type DocumentsStore } from "./documentsStore";
import type { DocumentService } from "./types";

type DocumentContextValue = {
  store: DocumentsStore;
  // The service itself, for the viewer's file and text requests.
  service: DocumentService;
};

const DocumentContext = createContext<DocumentContextValue | null>(null);

type DocumentProviderProps = {
  service: DocumentService;
  children: React.ReactNode;
};

export function DocumentProvider({ service, children }: DocumentProviderProps) {
  const [store] = useState(() => createDocumentsStore(service));
  const value = useMemo(() => ({ store, service }), [store, service]);
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

// The store's Documents, first-load state and freshest GenerateQuizJobs; re-renders on change.
export function useDocuments() {
  const { store } = useDocumentAPI();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return useMemo(
    () => ({
      documents: snapshot.documents,
      loadState: snapshot.loadState,
      jobOf: (documentId: number): GenerateQuizJob | null => snapshot.jobs.get(documentId) ?? null,
    }),
    [snapshot],
  );
}
