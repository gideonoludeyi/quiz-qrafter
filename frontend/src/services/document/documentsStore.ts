import { type Document, type GenerateQuizJob, isJobActive } from "@quizqrafter/shared";
import type { RequestError } from "../http";
import type { DocumentJobService } from "./types";

// How often to check on Active GenerateQuizJobs, and the longest wait after failed checks.
export const POLL_INTERVAL_MS = 2_000;
export const MAX_POLL_INTERVAL_MS = 30_000;

// Whether the first list load is still running, has worked, or failed (and why).
export type LoadState =
  | { status: "loading" }
  | { status: "loaded" }
  | { status: "failed"; error: RequestError };

export type DocumentsSnapshot = {
  documents: Document[];
  // The freshest known GenerateQuizJob per Document id.
  jobs: ReadonlyMap<number, GenerateQuizJob>;
  loadState: LoadState;
};

export type UploadResult =
  | { ok: true; document: Document; job: GenerateQuizJob }
  | { ok: false; error: RequestError };
export type StartResult = { ok: true; job: GenerateQuizJob } | { ok: false; error: RequestError };
export type RemoveResult = { ok: true } | { ok: false; error: RequestError };

// The page's focus and visibility, so tests can drive them without a DOM.
export type PageEvents = {
  visible(): boolean;
  subscribe(listener: (change: "focus" | "visible" | "hidden") => void): () => void;
};

// The browser window's focus and visibility.
export const browserPage: PageEvents = {
  visible: () => globalThis.document?.visibilityState !== "hidden",
  subscribe(listener) {
    const onFocus = () => listener("focus");
    const onVisibility = () =>
      listener(globalThis.document.visibilityState === "hidden" ? "hidden" : "visible");
    globalThis.addEventListener("focus", onFocus);
    globalThis.document.addEventListener("visibilitychange", onVisibility);
    return () => {
      globalThis.removeEventListener("focus", onFocus);
      globalThis.document.removeEventListener("visibilitychange", onVisibility);
    };
  },
};

export type DocumentsStore = {
  documents: () => Document[];
  jobOf: (documentId: number) => GenerateQuizJob | null;
  loadState: () => LoadState;
  // Stable between changes, for useSyncExternalStore.
  getSnapshot: () => DocumentsSnapshot;
  upload: (file: File) => Promise<UploadResult>;
  start: (documentId: number) => Promise<StartResult>;
  // Deletes a Document on the server, then drops it and its job from the list.
  remove: (documentId: number) => Promise<RemoveResult>;
  refresh: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  // Called once per GenerateQuizJob seen going from Active to succeeded or failed.
  onJobFinished: (listener: (job: GenerateQuizJob) => void) => () => void;
  // Starts afresh (empty list, first load) and polls while connected; returns disconnect.
  connect: () => () => void;
};

// Whether `next` is fresher than `current`: a newer job, or a later update of the same job.
function isFresher(current: GenerateQuizJob | undefined, next: GenerateQuizJob): boolean {
  if (current === undefined || next.id > current.id) return true;
  return next.id === current.id && Date.parse(next.updatedAt) > Date.parse(current.updatedAt);
}

// Holds the user's Documents and their GenerateQuizJobs, polling the list while any job is Active.
export function createDocumentsStore(
  service: DocumentJobService,
  page: PageEvents = browserPage,
): DocumentsStore {
  let snapshot: DocumentsSnapshot = {
    documents: [],
    jobs: new Map(),
    loadState: { status: "loading" },
  };
  const listeners = new Set<() => void>();
  const finishedListeners = new Set<(job: GenerateQuizJob) => void>();
  const finishedJobIds = new Set<number>();

  // Each connect() starts a new session; replies from an older one are dropped.
  let session = 0;
  let connected = false;
  let hidden = false;
  // Set by a 401 from the list, cleared by the next successful refresh.
  let signedOut = false;
  let interval = POLL_INTERVAL_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  // Bumped by each upload, so a list requested before it can't drop the new Document.
  let uploads = 0;
  // Deleted Documents, kept out of any list requested before their deletion.
  const removed = new Set<number>();

  const update = (next: Partial<DocumentsSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };

  // Merges jobs by the freshness rule; returns the new map and the jobs seen finishing.
  const mergeJobs = (incoming: GenerateQuizJob[]) => {
    let jobs: Map<number, GenerateQuizJob> | null = null;
    const finished: GenerateQuizJob[] = [];
    for (const job of incoming) {
      const current = (jobs ?? snapshot.jobs).get(job.documentId);
      if (!isFresher(current, job)) continue;
      jobs ??= new Map(snapshot.jobs);
      jobs.set(job.documentId, job);
      if (isJobActive(current) && !isJobActive(job) && !finishedJobIds.has(job.id)) {
        finishedJobIds.add(job.id);
        finished.push(job);
      }
    }
    return { jobs, finished };
  };

  const notifyFinished = (finished: GenerateQuizJob[]) => {
    for (const job of finished) for (const listener of finishedListeners) listener(job);
  };

  const anyActive = () =>
    snapshot.documents.some((document) => isJobActive(snapshot.jobs.get(document.id)));

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  // Schedules the next poll if one is due and none is pending.
  const schedule = () => {
    if (!connected || hidden || signedOut || !anyActive()) {
      clearTimer();
      return;
    }
    if (timer !== null || inFlight !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void refresh();
    }, interval);
  };

  const load = async () => {
    const requestSession = session;
    const requestUploads = uploads;
    if (snapshot.loadState.status === "failed") update({ loadState: { status: "loading" } });
    const result = await service.list();
    if (requestSession !== session) return;

    if (!result.ok) {
      if (result.error.kind === "not_signed_in") signedOut = true;
      else interval = Math.min(interval * 2, MAX_POLL_INTERVAL_MS);
      if (snapshot.loadState.status !== "loaded")
        update({ loadState: { status: "failed", error: result.error } });
      return;
    }

    signedOut = false;
    interval = POLL_INTERVAL_MS;
    const listed = result.value.filter((document) => !removed.has(document.id));
    const { jobs, finished } = mergeJobs(
      listed.flatMap((document) => (document.latestJob ? [document.latestJob] : [])),
    );
    // A list requested before an upload finished lacks the new Document; the next poll has it.
    const documents = requestUploads === uploads ? listed : snapshot.documents;
    update({ documents, jobs: jobs ?? snapshot.jobs, loadState: { status: "loaded" } });
    notifyFinished(finished);
  };

  // Reloads the list, sharing a request already in flight.
  const refresh = (): Promise<void> => {
    clearTimer();
    if (inFlight !== null) return inFlight;
    const current = load().finally(() => {
      if (inFlight === current) inFlight = null;
      schedule();
    });
    inFlight = current;
    return current;
  };

  const applyJob = (job: GenerateQuizJob, documents = snapshot.documents) => {
    const { jobs, finished } = mergeJobs([job]);
    update({ documents, jobs: jobs ?? snapshot.jobs });
    notifyFinished(finished);
    schedule();
  };

  return {
    documents: () => snapshot.documents,
    jobOf: (documentId) => snapshot.jobs.get(documentId) ?? null,
    loadState: () => snapshot.loadState,
    getSnapshot: () => snapshot,

    async upload(file) {
      const requestSession = session;
      const result = await service.upload(file);
      if (!result.ok) return result;
      const { document, job } = result.value;
      if (requestSession === session) {
        uploads++;
        const others = snapshot.documents.filter((existing) => existing.id !== document.id);
        applyJob(job, [document, ...others]);
      }
      return { ok: true, document, job };
    },

    async start(documentId) {
      const requestSession = session;
      const result = await service.startJob(documentId);
      if (!result.ok) return result;
      if (requestSession === session) applyJob(result.value);
      return { ok: true, job: result.value };
    },

    async remove(documentId) {
      const result = await service.remove(documentId);
      if (!result.ok) return result;
      removed.add(documentId);
      const jobs = new Map(snapshot.jobs);
      jobs.delete(documentId);
      update({
        documents: snapshot.documents.filter((document) => document.id !== documentId),
        jobs,
      });
      schedule();
      return { ok: true };
    },

    refresh,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    onJobFinished(listener) {
      finishedListeners.add(listener);
      return () => finishedListeners.delete(listener);
    },

    connect() {
      session++;
      connected = true;
      hidden = !page.visible();
      signedOut = false;
      interval = POLL_INTERVAL_MS;
      inFlight = null;
      clearTimer();
      finishedJobIds.clear();
      removed.clear();
      update({ documents: [], jobs: new Map(), loadState: { status: "loading" } });

      const unsubscribe = page.subscribe((change) => {
        hidden = change === "hidden";
        if (hidden) clearTimer();
        else void refresh();
      });
      void refresh();

      const connectedSession = session;
      return () => {
        unsubscribe();
        if (session !== connectedSession) return;
        connected = false;
        clearTimer();
      };
    },
  };
}
