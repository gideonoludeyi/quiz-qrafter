import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

export const BACKEND_DIR = path.resolve(import.meta.dirname, "..");

const DEFAULT_URL = "postgres://myusername:mypassword@localhost:5432/mydb";

// The dev database (from the environment or backend/.env), pointed at a separate "test" schema.
// Reads only DATABASE_URL from .env, so the developer's other settings don't leak into tests.
export function testDatabaseUrl(): string {
  const envFile = path.join(BACKEND_DIR, ".env");
  const fromFile = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, "utf-8")).DATABASE_URL
    : undefined;
  const url = new URL(process.env.DATABASE_URL ?? fromFile ?? DEFAULT_URL);
  url.searchParams.set("schema", "test");
  return url.href;
}
