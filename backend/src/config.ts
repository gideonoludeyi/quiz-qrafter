import { z } from "zod";

// Treat empty strings (e.g. `REDIS_URL=` in .env) as unset.
function blankAsUnset<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().default(8080),
  // Comma-separated list of origins allowed to call the API.
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  SESSION_SECRET: z.string().default("secret"),
  REDIS_URL: blankAsUnset(z.string().optional()),
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
  // "inline" runs the job worker inside the API process; "off" leaves it to `npm run worker`.
  WORKER: blankAsUnset(z.enum(["inline", "off"]).default("inline")),
  WORKER_CONCURRENCY: blankAsUnset(z.coerce.number().int().min(1).default(2)),
});

// Variables from before step 2, with what replaced them.
export const RENAMED_VARS: Record<string, string> = {
  PROVIDERS: "STORAGE=gcs|local and AI=gemini|fake",
  QUIZ_GENERATOR: "AI=gemini|fake",
  FAKE_DATA_DIR: "LOCAL_DATA_DIR",
  ANTHROPIC_MODEL: "LLM_MODEL",
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

  if (env.AI === "claude") {
    throw new Error(
      "AI=claude is no longer supported. Set AI=gemini (with GEMINI_API_KEY) or AI=fake.",
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

  if (parsed.STORAGE === "gcs" && parsed.GOOGLE_APPLICATION_CREDENTIALS === undefined) {
    throw new Error(
      "STORAGE=gcs needs GOOGLE_APPLICATION_CREDENTIALS. Set it, or set STORAGE=local to keep files on disk.",
    );
  }

  return {
    isProduction: parsed.NODE_ENV === "production",
    port: parsed.PORT,
    frontendOrigins: parsed.FRONTEND_URL.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    sessionSecret: parsed.SESSION_SECRET,
    redisUrl: parsed.REDIS_URL,
    storage: parsed.STORAGE,
    localDataDir: parsed.LOCAL_DATA_DIR,
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
      mode: parsed.WORKER,
      concurrency: parsed.WORKER_CONCURRENCY,
    },
  };
}
