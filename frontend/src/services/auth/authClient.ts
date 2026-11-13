import { createAuthClient } from "better-auth/react";

// Talks to better-auth on the backend (/api/auth/*). Cookies are sent cross-origin by default.
export function createQuizQrafterAuthClient(baseURL: URL) {
  return createAuthClient({ baseURL: baseURL.origin });
}

export type AuthClient = ReturnType<typeof createQuizQrafterAuthClient>;
