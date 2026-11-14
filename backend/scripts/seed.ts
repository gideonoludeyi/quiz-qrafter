// Creates a demo user with one document and quiz, using local storage and the fake AI.
// Run from backend/: vpx scripts/seed.ts
import { createAuth } from "../src/auth";
import { loadConfig } from "../src/config";
import { uploadDocument } from "../src/core/documents";
import { getGenerateQuizJob } from "../src/core/jobs";
import prisma from "../src/database";
import { FAKE_SAMPLE_TEXT } from "../src/providers/fake/fakeTranscriber";
import { createProviders } from "../src/providers";
import { createMemoryQueue } from "../src/queue/memory";

const EMAIL = "demo@example.com";
const PASSWORD = "Password1";

async function main() {
  const config = loadConfig({
    ...process.env,
    STORAGE: "local",
    AI: "fake",
    FAKE_AI_DELAY_MS: "0",
  });
  // Holds the job to run here instead of sending it to a worker.
  const queue = createMemoryQueue();
  const deps = { prisma, queue, providers: createProviders(config) };

  // Sign up through better-auth, so the demo user has a password account like any other user.
  if ((await prisma.user.findUnique({ where: { email: EMAIL } })) === null) {
    await createAuth(config, deps).api.signUpEmail({
      body: { name: "Demo User", email: EMAIL, password: PASSWORD },
    });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });

  const content = Buffer.from(FAKE_SAMPLE_TEXT);
  const { job } = await uploadDocument(deps, user.id, {
    filename: "photosynthesis.txt",
    content,
    size: content.length,
    mimeType: "text/plain",
  });
  await queue.deliverAll(deps);
  const finished = await getGenerateQuizJob(deps, user.id, job.id);

  console.error(`Seeded ${EMAIL} / ${PASSWORD}; GenerateQuizJob ${job.id} ${finished.status}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
