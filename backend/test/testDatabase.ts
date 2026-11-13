import { existsSync } from "node:fs";
import path from "node:path";

export const BACKEND_DIR = path.resolve(__dirname, "..");

const DEFAULT_URL = "postgres://myusername:mypassword@localhost:5432/mydb";

// The dev database from .env, pointed at a separate "test" schema.
export function testDatabaseUrl(): string {
  const envFile = path.join(BACKEND_DIR, ".env");
  if (process.env.DATABASE_URL === undefined && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_URL);
  url.searchParams.set("schema", "test");
  return url.href;
}
