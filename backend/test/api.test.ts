import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAdaptorServer } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import {
  DocumentSchema,
  MAX_UPLOAD_BYTES,
  QuizJobSchema,
  QuizSchema,
  type Quiz,
} from "@quizqrafter/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { runNextJob } from "../src/core/jobs";
import { createProviders } from "../src/providers";
import { testDatabaseUrl } from "./testDatabase";

const NOTES = "Mitochondria are the powerhouse of the cell. They produce ATP.";
const PASSWORD = "Password1";

const config = loadConfig({
  STORAGE: "local",
  AI: "fake",
  LOCAL_DATA_DIR: mkdtempSync(path.join(tmpdir(), "quizqrafter-test-")),
});
const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
const deps = { prisma, providers: createProviders(config) };
const extract = vi.spyOn(deps.providers.extractor, "extract");
// A Node server around the Hono app, for supertest.
const app = createAdaptorServer({ fetch: createApp(config, deps).fetch });

// Runs every due job, as the worker would.
async function runJobs() {
  while (await runNextJob(deps));
}

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
    await request(app).post("/api/v1/jobs").send({ documentId: 1 }).expect(401);
    await request(app).get("/api/v1/jobs/1").expect(401);
  });

  it("uploads a document and queues a job for it", async () => {
    const upload = await alice
      .post("/api/v1/document/upload")
      .attach("file", Buffer.from(NOTES), { filename: "notes.txt", contentType: "text/plain" })
      .expect(202);
    const document = DocumentSchema.parse(upload.body.document);
    const job = QuizJobSchema.parse(upload.body.job);
    expect(document).toMatchObject({
      filename: "notes.txt",
      mimeType: "text/plain",
      size: NOTES.length,
      quizId: null,
      latestJob: { id: job.id, status: "queued" },
    });
    expect(job).toMatchObject({ documentId: document.id, status: "queued", quizId: null });

    const list = await alice.get("/api/v1/document").expect(200);
    expect(list.body.documents).toHaveLength(1);
  });

  it("rejects an upload with no file", async () => {
    await alice.post("/api/v1/document/upload").expect(400);
  });

  it("rejects file types it can't read with 415", async () => {
    await alice
      .post("/api/v1/document/upload")
      .attach("file", Buffer.from("MZ"), {
        filename: "setup.exe",
        contentType: "application/x-msdownload",
      })
      .expect(415);
  });

  it("accepts markdown sent as application/octet-stream, using the extension", async () => {
    const upload = await alice
      .post("/api/v1/document/upload")
      .attach("file", Buffer.from("# Notes"), {
        filename: "notes.md",
        contentType: "application/octet-stream",
      })
      .expect(202);
    expect(upload.body.document.mimeType).toBe("text/markdown");
    await prisma.document.delete({ where: { id: upload.body.document.id } });
  });

  it("rejects files over the size limit with 413", async () => {
    await alice
      .post("/api/v1/document/upload")
      .attach("file", Buffer.alloc(MAX_UPLOAD_BYTES + 1), {
        filename: "huge.txt",
        contentType: "text/plain",
      })
      .expect(413);
  });

  it("the job reads the document and writes a structured quiz", async () => {
    const { body: list } = await alice.get("/api/v1/document").expect(200);
    const { id: documentId, latestJob } = list.documents[0];

    await runJobs();

    const { body: job } = await alice.get(`/api/v1/jobs/${latestJob.id}`).expect(200);
    expect(job).toMatchObject({
      status: "succeeded",
      stage: null,
      questionsWritten: 3,
      error: null,
    });
    expect(extract).toHaveBeenCalledWith(expect.any(Buffer), "text/plain");

    const response = await alice.get(`/api/v1/quiz/${job.quizId}`).expect(200);
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
    expect(after.documents[0]).toMatchObject({ quizId: quiz.id, latestJob: { quizId: quiz.id } });
  });

  it("regenerating reuses the transcript and replaces the quiz", async () => {
    const extractCallsBefore = extract.mock.calls.length;
    const started = await alice
      .post("/api/v1/jobs")
      .send({ documentId: quiz.documentId })
      .expect(202);
    // Asking again while it is queued returns the same job.
    const again = await alice
      .post("/api/v1/jobs")
      .send({ documentId: quiz.documentId })
      .expect(202);
    expect(again.body.id).toBe(started.body.id);

    await runJobs();

    const { body: job } = await alice.get(`/api/v1/jobs/${started.body.id}`).expect(200);
    expect(job).toMatchObject({ status: "succeeded", quizId: quiz.id });
    expect(extract.mock.calls.length).toBe(extractCallsBefore);
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
    await alice.post("/api/v1/jobs").send({ documentId: "one" }).expect(400);
    await alice
      .post("/api/v1/jobs")
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
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
    await bob.post("/api/v1/jobs").send({ documentId: quiz.documentId }).expect(404);
    const { body: aliceDocs } = await alice.get("/api/v1/document").expect(200);
    await bob.get(`/api/v1/jobs/${aliceDocs.documents[0].latestJob.id}`).expect(404);

    const { body } = await bob.get("/api/v1/document").expect(200);
    expect(body.documents).toEqual([]);
  });

  it("deletes the quiz", async () => {
    await alice.delete(`/api/v1/quiz/${quiz.id}`).expect(204);
    await alice.get(`/api/v1/quiz/${quiz.id}`).expect(404);
  });
});
