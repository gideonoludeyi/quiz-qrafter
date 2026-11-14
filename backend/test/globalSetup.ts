import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { createBullQueue } from "../src/queue/bullmq";
import { BACKEND_DIR, testDatabaseUrl, testQueueSettings } from "./testDatabase";

// Migrates the test schemas and empties them, and the test queue, before the test run.
export default async function setup() {
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$executeRawUnsafe(
    'TRUNCATE "quiz_jobs", "questions", "quizzes", "documents", "verifications", "users" RESTART IDENTITY CASCADE',
  );
  await prisma.$disconnect();

  const queue = createBullQueue(testQueueSettings());
  await queue.bull.obliterate({ force: true });
  await queue.close();
}
