import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { t } from "@/i18n";
import { asBlob, asJson, asText, describeRequestError, noBody, request } from "./http";

const URL_ = new URL("http://api.test/api/v1/jobs");
const schema = asJson({ parse: (data: unknown) => data as { id: number } });

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("parses a successful response, sending the session cookie and a JSON body", async () => {
    respond(200, { id: 7 });
    expect(await request(URL_, schema, { method: "POST", json: { documentId: 1 } })).toEqual({
      ok: true,
      value: { id: 7 },
    });
    expect(fetch).toHaveBeenCalledWith(
      URL_,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ documentId: 1 }),
      }),
    );
  });

  it("carries the server's reason when too many quizzes are in progress", async () => {
    const reason = { code: "errors.jobs.tooManyActive", values: { count: 3 } };
    respond(429, { error: { ...reason, message: "At most 3." } });
    expect(await request(URL_, schema)).toEqual({
      ok: false,
      error: { kind: "too_many_in_progress", reason },
    });
  });

  it("maps 401 and 404", async () => {
    respond(401, { error: { code: "errors.session.ended", message: "Signed out." } });
    expect(await request(URL_, schema)).toEqual({ ok: false, error: { kind: "not_signed_in" } });
    respond(404, { error: { code: "errors.notFound.document", message: "Not found." } });
    expect(await request(URL_, schema)).toEqual({
      ok: false,
      error: { kind: "not_found", reason: { code: "errors.notFound.document" } },
    });
  });

  it("maps other statuses to an HTTP error with the server's reason, if any", async () => {
    respond(500, "oops");
    expect(await request(URL_, schema)).toEqual({
      ok: false,
      error: { kind: "http", status: 500, reason: null },
    });
  });

  it("maps a rejected fetch to a network error", async () => {
    const cause = new TypeError("Failed to fetch");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(cause)),
    );
    expect(await request(URL_, schema)).toEqual({ ok: false, error: { kind: "network", cause } });
  });

  it("maps a response that doesn't match the schema to an HTTP error", async () => {
    respond(200, { id: "seven" });
    const strict = {
      parse: (data: unknown) => {
        if (typeof (data as { id: unknown }).id !== "number") throw new Error("bad");
        return data as { id: number };
      },
    };
    const result = await request(URL_, asJson(strict));
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "http", status: 200, reason: { code: "errors.response.invalid" } },
    });
  });

  it("reads a file, text or nothing, asking for the matching type", async () => {
    const fetchMock = vi.fn(async () => new Response("%PDF-1.7", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const pdf = await request(URL_, asBlob("application/pdf"));
    expect(pdf.ok && (await pdf.value.text())).toBe("%PDF-1.7");
    expect(await request(URL_, asText)).toEqual({ ok: true, value: "%PDF-1.7" });
    expect(await request(URL_, noBody, { method: "DELETE" })).toEqual({
      ok: true,
      value: undefined,
    });

    const accepts = fetchMock.mock.calls.map(
      (call) => ((call as unknown[])[1] as RequestInit).headers as Record<string, string>,
    );
    expect(accepts.map((headers) => headers.Accept)).toEqual([
      "application/pdf",
      "text/plain",
      "*/*",
    ]);
  });
});

describe("describeRequestError", () => {
  it("says what went wrong in words for the user", () => {
    const fallback = "The quiz couldn't be saved.";
    const tooMany = { code: "errors.jobs.tooManyActive", values: { count: 3 } };
    expect(describeRequestError({ kind: "too_many_in_progress", reason: tooMany }, fallback)).toBe(
      t("errors.jobs.tooManyActive", { count: 3 }),
    );
    expect(describeRequestError({ kind: "not_signed_in" }, fallback)).toMatch(/session has ended/);
    expect(describeRequestError({ kind: "network", cause: null }, fallback)).toMatch(
      /reach the server/,
    );
    const gone = { code: "errors.notFound.quiz" };
    expect(describeRequestError({ kind: "not_found", reason: gone }, fallback)).toBe(
      t("errors.notFound.quiz"),
    );
    expect(describeRequestError({ kind: "http", status: 500, reason: null }, fallback)).toBe(
      fallback,
    );
    // A code this build doesn't know, e.g. from a newer server, falls back too.
    const unknown = { code: ["errors", "fromTheFuture"].join(".") };
    expect(describeRequestError({ kind: "http", status: 500, reason: unknown }, fallback)).toBe(
      fallback,
    );
  });
});
