import path from "node:path";
import { z } from "zod";
import { log } from "./observability/events";

// backend/, from both src/ and the bundled dist/. Relative paths in settings start here.
const BACKEND_DIR = path.resolve(import.meta.dirname, "..");

// Treat empty strings (e.g. `LLM_MODEL=` in .env) as unset.
function blankAsUnset<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  // Prisma and the BullMQ quiz queue both use this database.
  DATABASE_URL: blankAsUnset(z.string().optional()),
  PORT: z.coerce.number().int().default(8080),
  // Comma-separated list of origins allowed to call the API.
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  // Signs better-auth's session cookies and tokens. Required in production.
  BETTER_AUTH_SECRET: blankAsUnset(z.string().min(32).optional()),
  // The public URL of this backend; reset links in emails point here.
  BETTER_AUTH_URL: blankAsUnset(z.string().url().optional()),
  // How password reset emails go out: sent with Resend, or printed to the log.
  EMAIL: blankAsUnset(z.enum(["resend", "console"]).default("console")),
  RESEND_API_KEY: blankAsUnset(z.string().optional()),
  // Resend's test sender only delivers to your own Resend account's email; use a verified domain in production.
  EMAIL_FROM: blankAsUnset(z.string().default("Quiz Qrafter <onboarding@resend.dev>")),
  // Where uploaded files and transcripts are kept: Google Cloud Storage, or a local directory.
  STORAGE: blankAsUnset(z.enum(["gcs", "local"]).default("gcs")),
  LOCAL_DATA_DIR: blankAsUnset(z.string().default(".data")),
  GOOGLE_APPLICATION_CREDENTIALS: blankAsUnset(z.string().optional()),
  DOCUMENTS_BUCKET: blankAsUnset(z.string().default("quizqrafter-documents")),
  // Who reads documents and writes quizzes: Gemini, or offline fakes for development and tests.
  AI: blankAsUnset(z.enum(["gemini", "fake"]).default("gemini")),
  GEMINI_API_KEY: blankAsUnset(z.string().optional()),
  // The Gemini model that reads documents and writes quizzes when AI=gemini.
  LLM_MODEL: blankAsUnset(z.string().default("gemini-4-hydrogen")),
  // Slows the fake AI down so tests can watch a job's progress.
  FAKE_AI_DELAY_MS: blankAsUnset(z.coerce.number().int().min(0).default(0)),
  // The Postgres schema holding BullMQ's tables, kept apart from the app's.
  QUEUE_SCHEMA: blankAsUnset(
    z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
      .default("bullmq"),
  ),
  // Each worker process runs this many quiz jobs at once.
  WORKER_CONCURRENCY: blankAsUnset(z.coerce.number().int().min(1).default(2)),
  // The worker process's health check port.
  WORKER_PORT: blankAsUnset(z.coerce.number().int().default(8081)),
});

// Variables from before step 2, with what replaced them.
export const RENAMED_VARS: Record<string, string> = {
  PROVIDERS: "STORAGE=gcs|local and AI=gemini|fake",
  QUIZ_GENERATOR: "AI=gemini|fake",
  FAKE_DATA_DIR: "LOCAL_DATA_DIR",
  ANTHROPIC_MODEL: "LLM_MODEL",
  SESSION_SECRET: "BETTER_AUTH_SECRET",
  GCLOUD_PROJECT_ID: "nothing (Gemini reads documents now; remove it)",
  GCLOUD_DOCUMENT_PROCESSOR_ID: "nothing (Gemini reads documents now; remove it)",
};

export type Config = ReturnType<typeof loadConfig>;

// Parses and validates environment variables into typed config.
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const renamed = Object.keys(RENAMED_VARS).filter((name) => env[name]);
  if (renamed.length > 0) {
    throw new Error(
      `Outdated environment variables: ${renamed.map((name) => `${name} → ${RENAMED_VARS[name]}`).join("; ")}.`,
    );
  }

  if (env.EMAIL === "betterauth") {
    throw new Error(
      "EMAIL=betterauth is no longer supported. Set EMAIL=resend (with RESEND_API_KEY) or EMAIL=console.",
    );
  }

  if (env.AI === "claude") {
    throw new Error(
      "AI=claude is no longer supported. Set AI=gemini (with GEMINI_API_KEY) or AI=fake.",
    );
  }

  if (env.WORKER) {
    log(
      "warn",
      "WORKER is no longer used: the API never runs quiz jobs. Start workers with `npm run worker`.",
    );
  }

  const parsed = EnvSchema.parse(env);

  if (parsed.AI === "gemini") {
    if (parsed.GEMINI_API_KEY === undefined) {
      throw new Error("AI=gemini needs GEMINI_API_KEY. Set it, or set AI=fake to work offline.");
    }
    if (!parsed.LLM_MODEL.startsWith("gemini")) {
      throw new Error(
        `LLM_MODEL=${parsed.LLM_MODEL} is not a Gemini model. Use a Gemini model such as gemini-4-hydrogen, or leave LLM_MODEL unset.`,
      );
    }
  }

  const isProduction = parsed.NODE_ENV === "production";
  if (isProduction && parsed.BETTER_AUTH_SECRET === undefined) {
    throw new Error("BETTER_AUTH_SECRET is required in production (at least 32 characters).");
  }
  if (isProduction && parsed.EMAIL === "console") {
    throw new Error(
      "EMAIL=console prints reset links, so it can't run in production. Set EMAIL=resend.",
    );
  }
  if (parsed.EMAIL === "resend" && parsed.RESEND_API_KEY === undefined) {
    throw new Error(
      "EMAIL=resend needs RESEND_API_KEY. Set it, or set EMAIL=console to print reset links to the log.",
    );
  }

  if (parsed.STORAGE === "gcs" && parsed.GOOGLE_APPLICATION_CREDENTIALS === undefined) {
    throw new Error(
      "STORAGE=gcs needs GOOGLE_APPLICATION_CREDENTIALS. Set it, or set STORAGE=local to keep files on disk.",
    );
  }

  return {
    isProduction,
    port: parsed.PORT,
    frontendOrigins: parsed.FRONTEND_URL.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    auth: {
      secret: parsed.BETTER_AUTH_SECRET ?? "development-only-better-auth-secret-0123456789",
      baseURL: parsed.BETTER_AUTH_URL ?? `http://localhost:${parsed.PORT}`,
    },
    email: {
      sender: parsed.EMAIL,
      resendApiKey: parsed.RESEND_API_KEY,
      from: parsed.EMAIL_FROM,
    },
    queue: {
      databaseUrl: parsed.DATABASE_URL,
      schema: parsed.QUEUE_SCHEMA,
    },
    storage: parsed.STORAGE,
    localDataDir: path.resolve(BACKEND_DIR, parsed.LOCAL_DATA_DIR),
    gcs: {
      credentialsFile: parsed.GOOGLE_APPLICATION_CREDENTIALS,
      documentsBucket: parsed.DOCUMENTS_BUCKET,
    },
    ai: parsed.AI,
    gemini: {
      apiKey: parsed.GEMINI_API_KEY,
      model: parsed.LLM_MODEL,
    },
    fakeAiDelayMs: parsed.FAKE_AI_DELAY_MS,
    worker: {
      concurrency: parsed.WORKER_CONCURRENCY,
      port: parsed.WORKER_PORT,
    },
  };
}
