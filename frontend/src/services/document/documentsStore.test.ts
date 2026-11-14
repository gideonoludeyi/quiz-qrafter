import type { Document, GenerateQuizJob, JobStatus } from "@quizqrafter/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { RequestError, RequestResult } from "../http";
import {
  createDocumentsStore,
  MAX_POLL_INTERVAL_MS,
  type PageEvents,
  POLL_INTERVAL_MS,
} from "./documentsStore";
import type { DocumentJobService } from "./types";

function job(
  id: number,
  documentId: number,
  status: JobStatus,
  updatedAt = "2026-01-01T00:00:00.000Z",
): GenerateQuizJob {
  return {
    id,
    documentId,
    status,
    stage: status === "running" ? "writing" : null,
    questionsWritten: 0,
    error: status === "failed" ? "It failed." : null,
    quizId: status === "succeeded" ? id * 100 : null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  };
}

function doc(id: number, latestJob: GenerateQuizJob | null = null): Document {
  return {
    id,
    filename: `notes-${id}.txt`,
    mimeType: "text/plain",
    size: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    quizId: latestJob?.quizId ?? null,
    latestJob,
  };
}

const ok = <T>(value: T): RequestResult<T> => ({ ok: true, value });
const fail = (error: RequestError): { ok: false; error: RequestError } => ({ ok: false, error });
const networkError: RequestError = { kind: "network", cause: new TypeError("Failed to fetch") };

// A service whose list answers with `server.documents` unless a test queues other answers.
function fakeService(documents: Document[] = []) {
  const server = { documents };
  const service = {
    list: vi.fn<DocumentJobService["list"]>(async () => ok(server.documents)),
    upload: vi.fn<DocumentJobService["upload"]>(),
    startJob: vi.fn<DocumentJobService["startJob"]>(),
  };
  return { server, service };
}

function fakePage() {
  let listener: ((change: "focus" | "visible" | "hidden") => void) | undefined;
  let visible = true;
  const page: PageEvents = {
    visible: () => visible,
    subscribe(next) {
      listener = next;
      return () => (listener = undefined);
    },
  };
  const emit = (change: "focus" | "visible" | "hidden") => {
    if (change !== "focus") visible = change === "visible";
    listener?.(change);
  };
  return { page, emit };
}

// Lets pending promises and any timers due within `ms` run.
const advance = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

function setup(documents: Document[] = [], firstList?: RequestResult<Document[]>) {
  const { server, service } = fakeService(documents);
  if (firstList) service.list.mockResolvedValueOnce(firstList);
  const { page, emit } = fakePage();
  const store = createDocumentsStore(service, page);
  const finished: GenerateQuizJob[] = [];
  store.onJobFinished((finishedJob) => finished.push(finishedJob));
  const disconnect = store.connect();
  return { server, service, store, emit, finished, disconnect };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("loading", () => {
  it("loads the list on connect, newest first as the API returns it", async () => {
    const { store } = setup([doc(2), doc(1)]);
    expect(store.loadState()).toEqual({ status: "loading" });
    await advance();
    expect(store.loadState()).toEqual({ status: "loaded" });
    expect(store.documents().map((document) => document.id)).toEqual([2, 1]);
  });

  it("reports a failed first load, and loads on retry", async () => {
    const { store } = setup([doc(1)], fail(networkError));
    await advance();
    expect(store.loadState()).toEqual({ status: "failed", error: networkError });

    await store.refresh();
    expect(store.loadState()).toEqual({ status: "loaded" });
    expect(store.documents()).toHaveLength(1);
  });

  it("keeps the snapshot the same object until something changes", async () => {
    const { store } = setup([doc(1)]);
    await advance();
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);
    await store.refresh();
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot().jobs).toBe(before.jobs);
  });
});

describe("freshness rule", () => {
  it("keeps the job with the highest id", async () => {
    const { server, service, store } = setup([doc(1, job(5, 1, "running"))]);
    await advance();
    service.startJob.mockResolvedValueOnce(ok(job(6, 1, "queued")));
    await store.start(1);
    expect(store.jobOf(1)?.id).toBe(6);

    server.documents = [doc(1, job(5, 1, "failed", "2026-01-02T00:00:00.000Z"))];
    await store.refresh();
    expect(store.jobOf(1)?.id).toBe(6);
  });

  it("keeps the latest update of the same job", async () => {
    const { server, store } = setup([doc(1, job(5, 1, "running", "2026-01-01T00:00:02.000Z"))]);
    await advance();
    server.documents = [doc(1, job(5, 1, "queued", "2026-01-01T00:00:01.000Z"))];
    await store.refresh();
    expect(store.jobOf(1)?.status).toBe("running");

    server.documents = [doc(1, job(5, 1, "succeeded", "2026-01-01T00:00:03.000Z"))];
    await store.refresh();
    expect(store.jobOf(1)?.status).toBe("succeeded");
  });

  it("never resets a Document's job to null", async () => {
    const { server, store } = setup([doc(1, job(5, 1, "failed"))]);
    await advance();
    server.documents = [doc(1, null)];
    await store.refresh();
    expect(store.jobOf(1)?.id).toBe(5);
  });
});

describe("polling", () => {
  it("polls the list while any job is Active, and stops when none is", async () => {
    const { server, service } = setup([doc(1, job(5, 1, "running")), doc(2)]);
    await advance();
    expect(service.list).toHaveBeenCalledTimes(1);

    await advance(POLL_INTERVAL_MS);
    expect(service.list).toHaveBeenCalledTimes(2);

    server.documents = [doc(1, job(5, 1, "succeeded", "2026-01-02T00:00:00.000Z")), doc(2)];
    await advance(POLL_INTERVAL_MS);
    expect(service.list).toHaveBeenCalledTimes(3);

    await advance(POLL_INTERVAL_MS * 10);
    expect(service.list).toHaveBeenCalledTimes(3);
  });

  it("doesn't poll when no job is Active", async () => {
    const { service } = setup([doc(1, job(5, 1, "succeeded"))]);
    await advance(POLL_INTERVAL_MS * 10);
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it("starts polling after a job is started", async () => {
    const { service, store } = setup([doc(1)]);
    await advance();
    service.startJob.mockResolvedValueOnce(ok(job(5, 1, "queued")));
    await store.start(1);
    await advance(POLL_INTERVAL_MS);
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it("refreshes on focus and when the page becomes visible", async () => {
    const { service, emit } = setup([doc(1)]);
    await advance();
    emit("focus");
    await advance();
    expect(service.list).toHaveBeenCalledTimes(2);
    emit("hidden");
    emit("visible");
    await advance();
    expect(service.list).toHaveBeenCalledTimes(3);
  });

  it("pauses while the page is hidden", async () => {
    const { service, emit } = setup([doc(1, job(5, 1, "running"))]);
    await advance();
    emit("hidden");
    await advance(POLL_INTERVAL_MS * 10);
    expect(service.list).toHaveBeenCalledTimes(1);

    emit("visible");
    await advance();
    expect(service.list).toHaveBeenCalledTimes(2);
    await advance(POLL_INTERVAL_MS);
    expect(service.list).toHaveBeenCalledTimes(3);
  });

  it("doubles the interval after each failed poll, up to the maximum, and resets on success", async () => {
    const { service } = setup([doc(1, job(5, 1, "running"))]);
    await advance();
    service.list.mockResolvedValue(fail(networkError));

    const waits = [
      POLL_INTERVAL_MS,
      4_000,
      8_000,
      16_000,
      MAX_POLL_INTERVAL_MS,
      MAX_POLL_INTERVAL_MS,
    ];
    for (const [index, wait] of waits.entries()) {
      await advance(wait - 1);
      expect(service.list).toHaveBeenCalledTimes(index + 1);
      await advance(1);
      expect(service.list).toHaveBeenCalledTimes(index + 2);
    }

    service.list.mockResolvedValue(ok([doc(1, job(5, 1, "running"))]));
    await advance(MAX_POLL_INTERVAL_MS);
    const calls = service.list.mock.calls.length;
    await advance(POLL_INTERVAL_MS);
    expect(service.list).toHaveBeenCalledTimes(calls + 1);
  });

  it("stops polling on a 401 until a later refresh succeeds", async () => {
    const { service, emit } = setup([doc(1, job(5, 1, "running"))]);
    await advance();
    service.list.mockResolvedValueOnce(fail({ kind: "not_signed_in" }));
    await advance(POLL_INTERVAL_MS);
    expect(service.list).toHaveBeenCalledTimes(2);
    await advance(MAX_POLL_INTERVAL_MS * 4);
    expect(service.list).toHaveBeenCalledTimes(2);

    emit("focus");
    await advance();
    expect(service.list).toHaveBeenCalledTimes(3);
    await advance(POLL_INTERVAL_MS);
    expect(service.list).toHaveBeenCalledTimes(4);
  });

  it("stops polling once disconnected", async () => {
    const { service, disconnect } = setup([doc(1, job(5, 1, "running"))]);
    await advance();
    disconnect();
    await advance(POLL_INTERVAL_MS * 10);
    expect(service.list).toHaveBeenCalledTimes(1);
  });
});

describe("onJobFinished", () => {
  it("fires once per job that goes from Active to finished", async () => {
    const { server, finished } = setup([doc(1, job(5, 1, "running")), doc(2, job(6, 2, "queued"))]);
    await advance();
    server.documents = [
      doc(1, job(5, 1, "succeeded", "2026-01-02T00:00:00.000Z")),
      doc(2, job(6, 2, "running", "2026-01-02T00:00:00.000Z")),
    ];
    await advance(POLL_INTERVAL_MS);
    expect(finished.map((finishedJob) => finishedJob.id)).toEqual([5]);

    server.documents = [
      doc(1, job(5, 1, "succeeded", "2026-01-03T00:00:00.000Z")),
      doc(2, job(6, 2, "failed", "2026-01-03T00:00:00.000Z")),
    ];
    await advance(POLL_INTERVAL_MS);
    await advance(POLL_INTERVAL_MS);
    expect(finished.map((finishedJob) => [finishedJob.id, finishedJob.status])).toEqual([
      [5, "succeeded"],
      [6, "failed"],
    ]);
  });

  it("doesn't fire for jobs that were already finished when first seen", async () => {
    const { finished } = setup([doc(1, job(5, 1, "succeeded"))]);
    await advance();
    expect(finished).toEqual([]);
  });
});

describe("start and upload", () => {
  it("returns the server's message when too many quizzes are in progress", async () => {
    const { service, store } = setup([doc(1)]);
    await advance();
    const message = "You already have 3 quizzes in progress.";
    service.startJob.mockResolvedValueOnce(fail({ kind: "too_many_in_progress", message }));
    expect(await store.start(1)).toEqual({
      ok: false,
      error: { kind: "too_many_in_progress", message },
    });
    expect(store.jobOf(1)).toBeNull();
  });

  it("adds an uploaded Document first and follows its job", async () => {
    const { server, service, store } = setup([doc(1)]);
    await advance();
    service.upload.mockResolvedValueOnce(ok({ document: doc(2), job: job(5, 2, "queued") }));
    const result = await store.upload(new File(["notes"], "notes.txt"));
    expect(result.ok).toBe(true);
    expect(store.documents().map((document) => document.id)).toEqual([2, 1]);
    expect(store.jobOf(2)?.status).toBe("queued");

    server.documents = [doc(2, job(5, 2, "running", "2026-01-02T00:00:00.000Z")), doc(1)];
    await advance(POLL_INTERVAL_MS);
    expect(store.jobOf(2)?.status).toBe("running");
  });

  it("keeps an uploaded Document when a list requested before the upload arrives", async () => {
    const { service, store } = setup([doc(1)]);
    await advance();
    let answer: (result: RequestResult<Document[]>) => void = () => {};
    service.list.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const refreshed = store.refresh();
    service.upload.mockResolvedValueOnce(ok({ document: doc(2), job: job(5, 2, "queued") }));
    await store.upload(new File(["notes"], "notes.txt"));
    answer(ok([doc(1)]));
    await refreshed;
    expect(store.documents().map((document) => document.id)).toEqual([2, 1]);
  });
});

describe("regressions", () => {
  it("bug 1: a job doesn't stay in progress after a failed refresh", async () => {
    const { server, service, store, finished } = setup([doc(1, job(5, 1, "running"))]);
    await advance();
    service.list.mockResolvedValueOnce(fail(networkError));
    await advance(POLL_INTERVAL_MS);
    expect(store.jobOf(1)?.status).toBe("running");

    server.documents = [doc(1, job(5, 1, "succeeded", "2026-01-02T00:00:00.000Z"))];
    await advance(4_000);
    expect(store.jobOf(1)?.status).toBe("succeeded");
    expect(finished.map((finishedJob) => finishedJob.id)).toEqual([5]);
  });

  it("bug 2: a job started elsewhere is picked up and followed", async () => {
    const { server, store } = setup([doc(1)]);
    await advance();
    server.documents = [doc(1, job(5, 1, "queued"))];
    await store.refresh();
    expect(store.jobOf(1)?.status).toBe("queued");

    server.documents = [doc(1, job(5, 1, "running", "2026-01-02T00:00:00.000Z"))];
    await advance(POLL_INTERVAL_MS);
    expect(store.jobOf(1)?.status).toBe("running");
  });

  it("bug 3: an older failed job doesn't override a newer one", async () => {
    const { service, store } = setup([doc(1, job(5, 1, "failed"))]);
    await advance();
    service.startJob.mockResolvedValueOnce(ok(job(6, 1, "queued")));
    await store.start(1);
    service.list.mockResolvedValueOnce(ok([doc(1, job(5, 1, "failed"))]));
    await advance(POLL_INTERVAL_MS);
    expect(store.jobOf(1)).toMatchObject({ id: 6, status: "queued" });
  });

  it("bug 4: failing requests aren't retried endlessly at a fixed pace", async () => {
    const { service } = setup([doc(1, job(5, 1, "running"))]);
    await advance();
    service.list.mockResolvedValue(fail({ kind: "http", status: 500, message: null }));
    await advance(5 * 60_000);
    // After 2, 4, 8 and 16 s, then every 30 s: 13 polls in five minutes, not 200.
    expect(service.list).toHaveBeenCalledTimes(1 + 13);
  });
});
