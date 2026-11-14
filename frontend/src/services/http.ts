import { ApiErrorResponseSchema, type AppError } from "@quizqrafter/shared";
import { describeError } from "@/i18n";

// Why a request failed, in terms the UI can act on. `reason` is the server's error code, if it sent one.
export type RequestError =
  | { kind: "too_many_in_progress"; reason: AppError | null }
  | { kind: "not_signed_in" }
  | { kind: "not_found"; reason: AppError | null }
  | { kind: "network"; cause: unknown }
  | { kind: "http"; status: number; reason: AppError | null };

export type RequestResult<T> = { ok: true; value: T } | { ok: false; error: RequestError };

type RequestOptions = {
  method?: string;
  // Sent as JSON.
  json?: unknown;
  // Sent as multipart form data.
  form?: FormData;
};

// The server's error code and values, if the body has them.
async function serverReason(response: Response): Promise<AppError | null> {
  const parsed = ApiErrorResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return null;
  const { code, values } = parsed.data.error;
  return values === undefined ? { code } : { code, values };
}

// How to read a successful response's body, and which type to ask for.
export type ResponseBody<T> = { accept: string; read: (response: Response) => Promise<T> };

// A JSON body, checked against `schema`.
export const asJson = <T>(schema: { parse: (data: unknown) => T }): ResponseBody<T> => ({
  accept: "application/json",
  read: async (response) => schema.parse(await response.json()),
});
// A file, such as a document or a PDF export.
export const asBlob = (accept = "*/*"): ResponseBody<Blob> => ({
  accept,
  read: (response) => response.blob(),
});
export const asText: ResponseBody<string> = { accept: "text/plain", read: (r) => r.text() };
export const noBody: ResponseBody<void> = { accept: "*/*", read: async () => undefined };

// Sends an API request with the session cookie and reads the response; never throws.
export async function request<T>(
  url: URL,
  body: ResponseBody<T>,
  { method = "GET", json, form }: RequestOptions = {},
): Promise<RequestResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "include",
      headers: {
        Accept: body.accept,
        ...(json === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: json === undefined ? form : JSON.stringify(json),
    });
  } catch (cause) {
    return { ok: false, error: { kind: "network", cause } };
  }

  if (!response.ok) {
    const reason = await serverReason(response);
    switch (response.status) {
      case 401:
        return { ok: false, error: { kind: "not_signed_in" } };
      case 404:
        return { ok: false, error: { kind: "not_found", reason } };
      case 429:
        return { ok: false, error: { kind: "too_many_in_progress", reason } };
      default:
        return { ok: false, error: { kind: "http", status: response.status, reason } };
    }
  }

  try {
    return { ok: true, value: await body.read(response) };
  } catch {
    return {
      ok: false,
      error: { kind: "http", status: response.status, reason: { code: "errors.response.invalid" } },
    };
  }
}

// What to tell the user about a failed request; `fallback` describes what was being done.
export function describeRequestError(error: RequestError, fallback: string): string {
  switch (error.kind) {
    case "not_signed_in":
      return "Your session has ended. Please sign in again.";
    case "network":
      return "Couldn't reach the server. Check your connection.";
    default:
      return describeError(error.reason) ?? fallback;
  }
}

// Saves a blob to the user's device under the given filename.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.hidden = true;
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
