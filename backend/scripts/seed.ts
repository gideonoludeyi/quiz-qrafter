// Creates a demo user with one document and quiz, using local storage and the fake AI.
// Run from backend/: vpx scripts/seed.ts
import bcrypt from "bcrypt";
import { loadConfig } from "../src/config";
import { uploadDocument } from "../src/core/documents";
import { getQuizJob, runNextJob } from "../src/core/jobs";
import prisma from "../src/database";
import { FAKE_SAMPLE_TEXT } from "../src/providers/fake/fakeExtractor";
import { createProviders } from "../src/providers";

const EMAIL = "demo@example.com";
const PASSWORD = "Password1";

async function main() {
  const config = loadConfig({
    ...process.env,
    STORAGE: "local",
    AI: "fake",
    FAKE_AI_DELAY_MS: "0",
  });
  const deps = { prisma, providers: createProviders(config) };

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, fullname: "Demo User", password: await bcrypt.hash(PASSWORD, 10) },
  });

  const content = Buffer.from(FAKE_SAMPLE_TEXT);
  const { job } = await uploadDocument(deps, user.id, {
    filename: "photosynthesis.txt",
    content,
    size: content.length,
    mimeType: "text/plain",
  });
  // Run queued jobs here instead of waiting for a worker.
  while (await runNextJob(deps));
  const finished = await getQuizJob(deps, user.id, job.id);

  console.error(`Seeded ${EMAIL} / ${PASSWORD}; quiz job ${job.id} ${finished.status}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
