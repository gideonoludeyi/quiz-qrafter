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

# QuizQrafter

Users upload study material (PDF, image, Word or text) and AI writes a quiz from it, which they can edit and export. A Hono API and separate quiz workers share one Postgres database. The React frontend talks to the API, and `packages/shared` holds the schemas both sides use.

The maintainers write this file by hand. When something here is wrong or missing, say so in your reply and suggest the wording; they will make the edit.

`GLOSSARY.md` defines the domain language (Document, Job, etc.). Use its terms when naming code, tests and messages, and propose a new entry when you name a new concept.

Architecture decisions and the reasons for them are recorded in `docs/adr/`. Read the relevant one before proposing to change how something is built.

## Running locally

`docker compose up -d` starts Postgres, and the Grafana LGTM stack (Grafana on 3001, OTLP on 4318). Wide events can be searched in Tempo (e.g., `{ span.app.job.id = 44 }`)
`backend/.env.example` documents every setting. Use `STORAGE=local` and `AI=fake` to work with no cloud accounts.

- `vp run dev`: API on 8080, one quiz worker on 8081, frontend on 3000. All three reload on change.
- `vpx scripts/seed.ts` (from `backend/`): creates `demo@example.com` / `Password1` with a document and a quiz.
- `vp test`: shared unit tests and backend tests. The backend tests use a `test` schema in the local Postgres, one file at a time.
- `vp run e2e`: Playwright smoke tests on their own ports (3100, 8090, 8091) with the fake AI.

The fake AI fails on any document containing `FAKE_FAIL`, and `FAKE_AI_DELAY_MS` slows it so progress is visible. With `EMAIL=console`, password reset links are printed in the backend log.

## Business rules

The product depends on these rules. The backend enforces them under concurrent requests, and each one has a test.

- **At most `MAX_ACTIVE_JOBS_PER_USER` (3) Active GenerateQuizJobs per user**, across all their Documents. This caps how much AI work one user can start at once.
    - It applies to uploads and to generating, regenerating and retrying a quiz.
    - Going over returns `429` with a message the user sees.
    - A refused upload leaves no Document and no stored file.
- **At most one Active GenerateQuizJob per Document.** Asking again returns the job already in progress, which doesn't count against the limit.
- **Retries:** a failure a retry can't fix (a refusal, a file too long, an unsupported type) fails the GenerateQuizJob at once with a message for the user. Any other failure is retried twice, 30 s and then 60 s later. After that the user sees a generic message.

## GenerateQuizJobs

The app's own GenerateQuizJob record is the truth users see: status, Stage, progress and error. BullMQ only delivers, retries and recovers jobs. It runs on its Postgres backend in its own schema (`QUEUE_SCHEMA`), so there is no Redis. The business rules above live in the app's code, and BullMQ is configured from them.

- The API only starts jobs. Worker processes run them (`npm run worker --workspace=backend`), and you can run as many as you like.
- When a worker stalls, BullMQ gives the job a new Run elsewhere. Only the newest Run's writes count, including the saved quiz.
- When a worker starts, it re-sends Active jobs whose message never reached the queue, and fails the ones BullMQ gave up on.
- Tests and the seed script run jobs through an in-memory queue in place of BullMQ. Only the BullMQ tests use the real queue.

## Authentication

better-auth runs at `/api/auth/*`, with sessions in Postgres. Everything under `/api/v1` needs a session.

- User IDs are integers, as is everything that refers to them.
- Passwords use bcrypt, so users from before better-auth keep working.
- better-auth only accepts sign-in from `FRONTEND_URL` origins. curl and tests need to send a matching `Origin` header.
- Resend's default sender (`onboarding@resend.dev`) only delivers to the Resend account owner.

## Shared schemas

The quiz, document and job schemas in `packages/shared` are the single definition for both the backend and the frontend. Change them there. The package has no build step: both apps compile it from source, so changes take effect at once.

## Database migrations

The user runs migrations in their own terminal, because Prisma asks for approval when a change can lose data. When a change needs one, edit `backend/prisma/schema.prisma` and give the user the commands, run from `backend/`:

1. `npx prisma migrate dev --create-only --name <snake_case_name>`, when the SQL needs a look first. A rename comes out as a drop and an add, and removing an enum value needs existing rows moved off it.
2. `npx prisma migrate dev` to create and apply it.

## Adding a Vite plugin

`vp add <vite-plugin>` fails with `ERESOLVE`. The `vite` alias points at Vite+ core, which bundles Vite 8 but reports version `1.x`, so plugin peer ranges never match, and overrides don't help. Instead, add the plugin to `package.json` by hand and run `npm install --legacy-peer-deps` once, from the repo root. After that, `vp install` works. Keep `legacy-peer-deps` out of `.npmrc`, so peer checks stay on for everything else.

Drop this workaround once Vite+ ships [PR #3317](https://github.com/voidzero-dev/vite-plus/pull/3317) (tracking issue [#2806](https://github.com/voidzero-dev/vite-plus/issues/2806)).

## Observability

Each API request and each Run of a Job emits one wide event: a JSON line on stdout (compact in development) that is also an OpenTelemetry span. Record facts about the work as fields on the current event, never as separate log lines. Field names are defined in one place, OpenTelemetry's where they exist and `app.*` with glossary terms otherwise. Events carry ids, never emails, filenames, document text, tokens, or other sensitive personally identifiable information (SPII). Redaction enforces this, and tests check it.

## User-facing Texts

All user-facing texts (UI labels, error messages, etc.) are externalized in `packages/shared/locales/en.yml`, and translated to English text using the i18next translation API. Server errors carry codes rather than English sentences.
