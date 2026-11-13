<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Project Notes

Keep project-specific notes below the `VITE PLUS END` marker. `vp install` regenerates everything between the markers.

## Adding Vite Plugins (npm Peer Conflicts)

The `vite` alias points at `@voidzero-dev/vite-plus-core@1.x`, which bundles Vite 8 but reports version `1.x`. npm checks plugin peer ranges such as `vite@"^5 || ^6 || ^7 || ^8"` against `1.x`, so `vp add <vite-plugin>` fails with `ERESOLVE`. Overrides do not fix this.

To add or upgrade a Vite plugin, edit `package.json` by hand and run `npm install --legacy-peer-deps` from the repo root. Do not set `legacy-peer-deps` in `.npmrc`, because that turns off peer checks for the whole repo. After the lockfile is updated, a plain `vp install` works.

Remove this workaround after upgrading to a Vite+ release that includes [PR #3317](https://github.com/voidzero-dev/vite-plus/pull/3317), which aligns the core version with the bundled Vite version. Tracking issue: [#2806](https://github.com/voidzero-dev/vite-plus/issues/2806).

## Running Offline (No Cloud Accounts)

The backend can run without Google Cloud or the Gemini API. In `backend/.env`, set `STORAGE=local` (files go under `backend/.data/`) and `AI=fake` (text and Word files are read as-is, PDFs and images become sample text, and every quiz is the same three questions). Postgres still runs locally.

- `docker compose up -d` starts Postgres and Redis.
- `vp run dev` builds `packages/shared` first, then starts the backend (port 8080, with the job worker inside it) and frontend (port 3000).
- `vpx scripts/seed.ts` (from `backend/`) creates `demo@example.com` / `Password1` with a document and a quiz.
- Password reset links appear in the backend log (`EMAIL=console`).
- `vp test` runs the shared unit tests and the backend tests. The backend tests use a separate `test` schema in the local Postgres.
- `vp run e2e` runs the Playwright smoke tests against their own servers on ports 3100 and 8090, with `AI=fake`. It uses Playwright's Chromium if you have run `npx playwright install chromium`, and your installed Chrome otherwise.

`AI=gemini` (the default) needs `GEMINI_API_KEY`; `LLM_MODEL` picks the Gemini model (default `gemini-4-hydrogen`). It works with either storage setting. `STORAGE=gcs` (the default) needs `GOOGLE_APPLICATION_CREDENTIALS`.

## Quiz Jobs

Uploading a file queues a quiz job in the `quiz_jobs` table. A worker claims it, has Gemini read the file (PDFs and images; text and Word files are read locally), writes the quiz, and saves it. The browser polls `GET /api/v1/jobs/:id` for progress.

- The worker runs inside the API server unless `WORKER=off`; `npm run worker --workspace=backend` runs it on its own.
- Failures that a retry can't fix (a refusal, a file too long to read, an unsupported file) throw `PermanentJobError`, whose message is shown to the user. Any other error is retried twice, 30 s and then 60 s later.
- A job whose worker stops sending heartbeats for 2 minutes is requeued.
- `FAKE_AI_DELAY_MS` slows the fake AI so progress is visible; the fake AI fails on notes containing `FAKE_FAIL`.

## Authentication

The backend (Hono) uses better-auth, mounted at `/api/auth/*`; the frontend talks to it through `better-auth/react` (`frontend/src/services/auth/authClient.ts`). Sessions are stored in Postgres and last 7 days. API routes under `/api/v1` require a session (`restrict` in `backend/src/api/v1/http.ts`).

- Passwords are hashed with bcrypt, which users created before better-auth were hashed with.
- IDs are serial integers (`generateId: "serial"`), so `users.id` and everything that references it are numbers.
- Password reset emails go through the email provider: `EMAIL=console` (the default) prints the link to the backend log, `EMAIL=betterauth` sends it with better-auth's email service and needs `BETTER_AUTH_API_KEY`.
- better-auth only accepts sign-in requests from `FRONTEND_URL` origins. Requests without a trusted `Origin` header (e.g. curl, tests) need one set.

## Shared Schemas

`packages/shared` holds the zod schemas for quizzes and documents, used by both the backend and the frontend. Change a schema there, never in one app only. Run `vp run --filter @quizqrafter/shared build` after editing it; `vp run dev` does this once at startup and does not watch for changes.
