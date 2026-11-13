// Throws with the server's error message (or the fallback) when a response is not OK.
export async function expectOk(response: Response, fallback: string): Promise<Response> {
  if (response.ok) return response;
  const body = await response.json().catch(() => null);
  throw new Error(typeof body?.error === "string" ? body.error : fallback);
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
