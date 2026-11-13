import { existsSync } from "node:fs";
import { chromium, defineConfig } from "@playwright/test";
import { RENAMED_VARS } from "./backend/src/config";
import { testDatabaseUrl } from "./backend/test/testDatabase";

// Use Playwright's own Chromium if it has been downloaded (`npx playwright install chromium`),
// otherwise the installed Chrome. PLAYWRIGHT_CHANNEL overrides both.
const channel =
  process.env.PLAYWRIGHT_CHANNEL ?? (existsSync(chromium.executablePath()) ? undefined : "chrome");

// Ports chosen to stay clear of a dev server already running on 3000/8080.
const WEB_PORT = 3100;
const API_PORT = 8090;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      // Local storage and the fake AI, so no Google Cloud or Gemini credentials are needed.
      command: "npm run dev --workspace=backend",
      url: `http://localhost:${API_PORT}/healthz`,
      env: {
        // The backend also reads backend/.env (Prisma loads it too), but never overrides a
        // variable that is already set. Blanking the renamed ones keeps a developer's
        // leftover settings from stopping the test server.
        ...Object.fromEntries(Object.keys(RENAMED_VARS).map((name) => [name, ""])),
        STORAGE: "local",
        AI: "fake",
        // About 3 s of writing, so the page (which checks every 1.5 s) sees progress before the quiz appears.
        FAKE_AI_DELAY_MS: "1000",
        PORT: String(API_PORT),
        FRONTEND_URL: `http://localhost:${WEB_PORT}`,
        DATABASE_URL: testDatabaseUrl(),
        REDIS_URL: "",
      },
    },
    {
      command: `npx vp dev --port ${WEB_PORT} --strictPort`,
      cwd: "frontend",
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
