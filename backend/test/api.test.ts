import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { DocumentSchema, QuizSchema, type Quiz } from "@quizqrafter/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createProviders } from "../src/providers";
import { testDatabaseUrl } from "./testDatabase";

const NOTES = "Mitochondria are the powerhouse of the cell. They produce ATP.";
const PASSWORD = "Password1";

const config = loadConfig({
  PROVIDERS: "fake",
  FAKE_DATA_DIR: mkdtempSync(path.join(tmpdir(), "quizqrafter-test-")),
});
const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
const app = createApp(config, { prisma, providers: createProviders(config) });

// Signs up and logs in a new user, returning an agent that keeps the session cookie.
async function loggedInAgent(email: string) {
  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/signup")
    .send({ email, password: PASSWORD, fullname: "Test User" })
    .expect(200);
  await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
  return agent;
}

describe("quiz API", () => {
  let alice: Awaited<ReturnType<typeof loggedInAgent>>;
  let quiz: Quiz;

  beforeAll(async () => {
    alice = await loggedInAgent("alice@example.com");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects requests without a session", async () => {
    await request(app).get("/api/v1/document").expect(401);
    await request(app).post("/api/v1/quiz").send({ documentId: 1 }).expect(401);
  });

  it("uploads a document and lists it", async () => {
    const upload = await alice
      .post("/api/v1/document/upload")
      .attach("file", Buffer.from(NOTES), { filename: "notes.txt", contentType: "text/plain" })
      .expect(200);
    const document = DocumentSchema.parse(upload.body.document);
    expect(document).toMatchObject({ filename: "notes.txt", size: NOTES.length, quizId: null });

    const list = await alice.get("/api/v1/document").expect(200);
    expect(list.body.documents).toHaveLength(1);
  });

  it("rejects an upload with no file", async () => {
    await alice.post("/api/v1/document/upload").expect(400);
  });

  it("generates a structured quiz from the document", async () => {
    const { body: list } = await alice.get("/api/v1/document").expect(200);
    const documentId = list.documents[0].id;

    const response = await alice.post("/api/v1/quiz").send({ documentId }).expect(200);
    quiz = QuizSchema.parse(response.body);

    expect(quiz.documentId).toBe(documentId);
    expect(quiz.questions.map((q) => q.type)).toEqual([
      "multiple_choice",
      "true_false",
      "short_answer",
    ]);
    // The fake generator quotes the document, which proves the transcript round-tripped.
    expect(quiz.questions[0].sourceQuote).toBe("Mitochondria are the powerhouse of the cell.");

    const { body: after } = await alice.get("/api/v1/document").expect(200);
    expect(after.documents[0].quizId).toBe(quiz.id);
  });

  it("regenerating replaces the quiz instead of adding a second one", async () => {
    const response = await alice
      .post("/api/v1/quiz")
      .send({ documentId: quiz.documentId })
      .expect(200);
    expect(response.body.id).toBe(quiz.id);
    expect(response.body.questions).toHaveLength(3);
  });

  it("saves edits and returns them on the next read", async () => {
    const edited = {
      title: "Cell biology",
      questions: [
        {
          type: "true_false",
          prompt: "Mitochondria produce ATP.",
          answer: true,
          explanation: "The notes say so.",
          sourceQuote: null,
        },
        {
          type: "multiple_choice",
          prompt: "What is the powerhouse of the cell?",
          choices: ["Nucleus", "Mitochondria"],
          answerIndex: 1,
          explanation: "",
          sourceQuote: "Mitochondria are the powerhouse of the cell.",
        },
      ],
    };
    await alice.put(`/api/v1/quiz/${quiz.id}`).send(edited).expect(200);

    const { body } = await alice.get(`/api/v1/quiz/${quiz.id}`).expect(200);
    expect(QuizSchema.parse(body)).toMatchObject(edited);
  });

  it("rejects invalid bodies with 400", async () => {
    await alice.post("/api/v1/quiz").send({ documentId: "one" }).expect(400);
    await alice.put(`/api/v1/quiz/${quiz.id}`).send({ title: "", questions: [] }).expect(400);
    await alice
      .put(`/api/v1/quiz/${quiz.id}`)
      .send({
        title: "Bad index",
        questions: [
          {
            type: "multiple_choice",
            prompt: "Pick one",
            choices: ["a", "b"],
            answerIndex: 5,
            explanation: "",
            sourceQuote: null,
          },
        ],
      })
      .expect(400);
    await alice.get("/api/v1/quiz/not-a-number").expect(400);
  });

  it("exports the quiz as PDF and markdown", async () => {
    const pdf = await alice.get(`/api/v1/quiz/${quiz.id}/export`).buffer(true).expect(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    const markdown = await alice.get(`/api/v1/quiz/${quiz.id}/export?format=markdown`).expect(200);
    expect(markdown.text).toContain("# Cell biology");
    expect(markdown.text).toContain("## Answer Key");
    expect(markdown.text).toContain("2. B. Mitochondria");
  });

  it("hides one user's quiz and documents from another user", async () => {
    const bob = await loggedInAgent("bob@example.com");

    await bob.get(`/api/v1/quiz/${quiz.id}`).expect(404);
    await bob.put(`/api/v1/quiz/${quiz.id}`).send({ title: "Mine now", questions: [] }).expect(404);
    await bob.get(`/api/v1/quiz/${quiz.id}/export`).expect(404);
    await bob.delete(`/api/v1/quiz/${quiz.id}`).expect(404);
    await bob.post("/api/v1/quiz").send({ documentId: quiz.documentId }).expect(404);

    const { body } = await bob.get("/api/v1/document").expect(200);
    expect(body.documents).toEqual([]);
  });

  it("deletes the quiz", async () => {
    await alice.delete(`/api/v1/quiz/${quiz.id}`).expect(204);
    await alice.get(`/api/v1/quiz/${quiz.id}`).expect(404);
  });
});
