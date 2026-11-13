import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { BACKEND_DIR, testDatabaseUrl } from "./testDatabase";

// Migrates the test schema and empties it before the test run.
export default async function setup() {
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$executeRawUnsafe(
    'TRUNCATE "quiz_jobs", "questions", "quizzes", "documents", "users" RESTART IDENTITY CASCADE',
  );
  await prisma.$disconnect();
}
