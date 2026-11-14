// Why a request failed, in terms the UI can act on.
export type RequestError =
  | { kind: "too_many_in_progress"; message: string }
  | { kind: "not_signed_in" }
  | { kind: "not_found"; message: string | null }
  | { kind: "network"; cause: unknown }
  | { kind: "http"; status: number; message: string | null };

export type RequestResult<T> = { ok: true; value: T } | { ok: false; error: RequestError };

type RequestOptions = {
  method?: string;
  // Sent as JSON.
  json?: unknown;
  // Sent as multipart form data.
  form?: FormData;
};

// The server's `{ error }` message, if the body has one.
async function serverMessage(response: Response): Promise<string | null> {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : null;
}

// Sends an API request with the session cookie and parses the JSON response; never throws.
export async function request<T>(
  url: URL,
  schema: { parse: (data: unknown) => T },
  { method = "GET", json, form }: RequestOptions = {},
): Promise<RequestResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(json === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: json === undefined ? form : JSON.stringify(json),
    });
  } catch (cause) {
    return { ok: false, error: { kind: "network", cause } };
  }

  if (!response.ok) {
    const message = await serverMessage(response);
    switch (response.status) {
      case 401:
        return { ok: false, error: { kind: "not_signed_in" } };
      case 404:
        return { ok: false, error: { kind: "not_found", message } };
      case 429:
        return {
          ok: false,
          error: {
            kind: "too_many_in_progress",
            message: message ?? "Too many quizzes in progress.",
          },
        };
      default:
        return { ok: false, error: { kind: "http", status: response.status, message } };
    }
  }

  try {
    return { ok: true, value: schema.parse(await response.json()) };
  } catch {
    return {
      ok: false,
      error: {
        kind: "http",
        status: response.status,
        message: "The server's answer wasn't understood.",
      },
    };
  }
}

// Throws with the server's error message (or the fallback and status) when a response is not OK.
export async function expectOk(response: Response, fallback: string): Promise<Response> {
  if (response.ok) return response;
  const body = await response.json().catch(() => null);
  throw new Error(
    typeof body?.error === "string" ? body.error : `${fallback} (${response.status})`,
  );
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
