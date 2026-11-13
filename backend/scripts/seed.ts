// Creates a demo user with one document and quiz, using the fake providers.
// Run from backend/: vpx scripts/seed.ts
import bcrypt from "bcrypt";
import { loadConfig } from "../src/config";
import { uploadDocument } from "../src/core/documents";
import { generateQuiz } from "../src/core/quizzes";
import prisma from "../src/database";
import { FAKE_SAMPLE_TEXT } from "../src/providers/fake/fakeExtractor";
import { createProviders } from "../src/providers";

const EMAIL = "demo@example.com";
const PASSWORD = "Password1";

async function main() {
  const config = loadConfig({ ...process.env, PROVIDERS: "fake" });
  const deps = { prisma, providers: createProviders(config) };

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, fullname: "Demo User", password: await bcrypt.hash(PASSWORD, 10) },
  });

  const content = Buffer.from(FAKE_SAMPLE_TEXT);
  const document = await uploadDocument(deps, user.id, {
    filename: "photosynthesis.txt",
    content,
    size: content.length,
    mimeType: "text/plain",
  });
  const quiz = await generateQuiz(deps, user.id, document.id);

  console.error(
    `Seeded ${EMAIL} / ${PASSWORD} with quiz ${quiz.id} (${quiz.questions.length} questions).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
