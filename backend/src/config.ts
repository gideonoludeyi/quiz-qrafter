import { z } from "zod";

// Treat empty strings (e.g. `REDIS_URL=` in .env) as unset.
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().default(8080),
  // Comma-separated list of origins allowed to call the API.
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  SESSION_SECRET: z.string().default("secret"),
  REDIS_URL: optionalString,
  // "fake" runs without Google Cloud or the Claude API, for local development and tests.
  PROVIDERS: z.enum(["real", "fake"]).default("real"),
  FAKE_DATA_DIR: z.string().default(".data"),
  GCLOUD_PROJECT_ID: optionalString,
  GCLOUD_LOCATION: z.string().default("us"),
  GCLOUD_DOCUMENT_PROCESSOR_ID: optionalString,
  GOOGLE_APPLICATION_CREDENTIALS: optionalString,
  DOCUMENTS_BUCKET: z.string().default("quizqrafter-documents"),
  // The Anthropic SDK reads ANTHROPIC_API_KEY from the environment itself.
  ANTHROPIC_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().default("claude-opus-5-5"),
  ),
  // Overrides PROVIDERS for quiz generation only, e.g. PROVIDERS=fake with QUIZ_GENERATOR=real.
  QUIZ_GENERATOR: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["real", "fake"]).optional(),
  ),
});

const REAL_PROVIDER_VARS = [
  "GCLOUD_PROJECT_ID",
  "GCLOUD_DOCUMENT_PROCESSOR_ID",
  "GOOGLE_APPLICATION_CREDENTIALS",
] as const;

export type Config = ReturnType<typeof loadConfig>;

// Parses and validates environment variables into typed config.
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.parse(env);

  if (parsed.PROVIDERS === "real") {
    const missing = REAL_PROVIDER_VARS.filter((name) => parsed[name] === undefined);
    if (missing.length > 0) {
      throw new Error(
        `Missing environment variables: ${missing.join(", ")}. Set them, or set PROVIDERS=fake to run without cloud services.`,
      );
    }
  }

  return {
    isProduction: parsed.NODE_ENV === "production",
    port: parsed.PORT,
    frontendOrigins: parsed.FRONTEND_URL.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    sessionSecret: parsed.SESSION_SECRET,
    redisUrl: parsed.REDIS_URL,
    providers: parsed.PROVIDERS,
    quizGenerator: parsed.QUIZ_GENERATOR ?? parsed.PROVIDERS,
    fakeDataDir: parsed.FAKE_DATA_DIR,
    gcloud: {
      projectId: parsed.GCLOUD_PROJECT_ID,
      location: parsed.GCLOUD_LOCATION,
      documentProcessorId: parsed.GCLOUD_DOCUMENT_PROCESSOR_ID,
      credentialsFile: parsed.GOOGLE_APPLICATION_CREDENTIALS,
      documentsBucket: parsed.DOCUMENTS_BUCKET,
    },
    anthropic: {
      model: parsed.ANTHROPIC_MODEL,
    },
  };
}
