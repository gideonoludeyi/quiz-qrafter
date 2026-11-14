import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { request } from "./http";

const URL_ = new URL("http://api.test/api/v1/jobs");
const schema = { parse: (data: unknown) => data as { id: number } };

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

  it("carries the server's message when too many quizzes are in progress", async () => {
    respond(429, { error: "You already have 3 quizzes in progress." });
    expect(await request(URL_, schema)).toEqual({
      ok: false,
      error: { kind: "too_many_in_progress", message: "You already have 3 quizzes in progress." },
    });
  });

  it("maps 401 and 404", async () => {
    respond(401, { error: "Unauthorized" });
    expect(await request(URL_, schema)).toEqual({ ok: false, error: { kind: "not_signed_in" } });
    respond(404, { error: "Document not found" });
    expect(await request(URL_, schema)).toEqual({
      ok: false,
      error: { kind: "not_found", message: "Document not found" },
    });
  });

  it("maps other statuses to an HTTP error with the server's message, if any", async () => {
    respond(500, "oops");
    expect(await request(URL_, schema)).toEqual({
      ok: false,
      error: { kind: "http", status: 500, message: null },
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
    const result = await request(URL_, strict);
    expect(result).toMatchObject({ ok: false, error: { kind: "http", status: 200 } });
  });
});
