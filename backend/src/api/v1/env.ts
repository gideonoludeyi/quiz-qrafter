import type { Session } from "hono-sessions";

export type SessionData = { userId: number };

// Context variables shared by the API routes.
export type AppEnv = {
  Variables: {
    session: Session<SessionData>;
    session_key_rotation: boolean;
    // Set by `restrict` for logged-in requests.
    userId: number;
  };
};
