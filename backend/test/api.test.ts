import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAdaptorServer } from "@hono/node-server";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import {
  ApiErrorResponseSchema,
  DocumentSchema,
  MAX_UPLOAD_BYTES,
  GenerateQuizJobSchema,
  QuizSchema,
  type Quiz,
} from "@quizqrafter/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { MAX_ACTIVE_JOBS_PER_USER } from "../src/core/jobs";
import { t } from "../src/i18n";
import { createProviders } from "../src/providers";
import type { ConsoleEmailSender } from "../src/providers/email/consoleEmailSender";
import { createMemoryQueue } from "../src/queue/memory";
import { DOCX, captureEvents, docxWith } from "./fixtures";
import { testDatabaseUrl } from "./testDatabase";

const NOTES = "Mitochondria are the powerhouse of the cell. They produce ATP.";
const PASSWORD = "Password1";

const config = loadConfig({
  STORAGE: "local",
  AI: "fake",
  LOCAL_DATA_DIR: mkdtempSync(path.join(tmpdir(), "quizqrafter-test-")),
});
const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
// Holds jobs until runJobs, standing in for BullMQ (covered in bullmq.test.ts and e2e).
const queue = createMemoryQueue();
const deps = { prisma, queue, providers: createProviders(config) };
const transcribe = vi.spyOn(deps.providers.transcriber, "transcribe");
const putBlob = vi.spyOn(deps.providers.blobs, "put");
// A Node server around the Hono app, for supertest.
const app = createAdaptorServer({ fetch: createApp(config, deps).fetch });

// Runs every queued job, as a worker would.
const runJobs = () => queue.deliverAll(deps);

// better-auth only accepts sign-in requests from trusted origins (FRONTEND_URL).
const ORIGIN = config.frontendOrigins[0];
const email = deps.providers.email as ConsoleEmailSender;

// Signs up a new user, returning an agent that keeps the session cookie (sign-up also signs in).
async function loggedInAgent(address: string) {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/sign-up/email")
    .set("Origin", ORIGIN)
    .send({ name: "Test User", email: address, password: PASSWORD })
    .expect(200);
  return agent;
}

function signIn(agent: ReturnType<typeof request.agent>, address: string, password: string) {
  return agent
    .post("/api/auth/sign-in/email")
    .set("Origin", ORIGIN)
    .send({ email: address, password });
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
    const { body } = await request(app).get("/api/v1/document").expect(401);
    expect(body).toEqual({
      error: { code: "errors.session.ended", message: t("errors.session.ended") },
    });
    await request(app).post("/api/v1/jobs").send({ documentId: 1 }).expect(401);
    await request(app).get("/api/v1/jobs/1").expect(401);
  });

  it("uploads a document and queues a job for it", async () => {
    const upload = await alice
      .post("/api/v1/document/upload")
      .attach("file", Buffer.from(NOTES), { filename: "notes.txt", contentType: "text/plain" })
      .expect(202);
    const document = DocumentSchema.parse(upload.body.document);
    const job = GenerateQuizJobSchema.parse(upload.body.job);
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
    const { body } = await alice.post("/api/v1/document/upload").expect(400);
    expect(body.error.code).toBe("errors.upload.noFile");
  });

  it("rejects file types it can't read with 415", async () => {
    const { body } = await alice
      .post("/api/v1/document/upload")
      .attach("file", Buffer.from("MZ"), {
        filename: "setup.exe",
        contentType: "application/x-msdownload",
      })
      .expect(415);
    expect(body.error.code).toBe("errors.upload.unsupportedType");
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

  it("serves a document's original file for the viewer", async () => {
    const { body: list } = await alice.get("/api/v1/document").expect(200);
    const notes = list.documents.find((d: { filename: string }) => d.filename === "notes.txt");
    const response = await alice.get(`/api/v1/document/${notes.id}/file`).expect(200);
    expect(response.headers["content-type"]).toMatch(/^text\/plain/);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-disposition"]).toBe("inline; filename*=UTF-8''notes.txt");
    expect(response.text).toBe(NOTES);
  });

  it("serves a Word document's text, and refuses text for files it can't read locally", async () => {
    const docx = await alice
      .post("/api/v1/document/upload")
      .attach("file", await docxWith("Word notes about ribosomes."), {
        filename: "notes.docx",
        contentType: DOCX,
      })
      .expect(202);
    const text = await alice.get(`/api/v1/document/${docx.body.document.id}/text`).expect(200);
    expect(text.text.trim()).toBe("Word notes about ribosomes.");

    const png = await alice
      .post("/api/v1/document/upload")
      .attach("file", Buffer.from("PNG"), { filename: "diagram.png", contentType: "image/png" })
      .expect(202);
    await alice.get(`/api/v1/document/${png.body.document.id}/text`).expect(415);
    await alice.get("/api/v1/document/999999/file").expect(404);

    await prisma.document.deleteMany({
      where: { id: { in: [docx.body.document.id, png.body.document.id] } },
    });
  });

  it("rejects files over the size limit with 413", async () => {
    const { body } = await alice
      .post("/api/v1/document/upload")
      .attach("file", Buffer.alloc(MAX_UPLOAD_BYTES + 1), {
        filename: "huge.txt",
        contentType: "text/plain",
      })
      .expect(413);
    expect(body.error).toMatchObject({ code: "errors.upload.tooLarge", values: { maxMb: 20 } });
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
    // A text file is read on the server, not by the AI.
    expect(transcribe).not.toHaveBeenCalled();

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
    const putsBefore = putBlob.mock.calls.length;
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
    // The transcript saved the first time is reused, not written again.
    expect(putBlob.mock.calls.length).toBe(putsBefore);
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

  it("refuses uploads and new quizzes over the in-progress limit with 429", async () => {
    const busy = await loggedInAgent("busy@example.com");
    const upload = (filename: string) =>
      busy
        .post("/api/v1/document/upload")
        .attach("file", Buffer.from(NOTES), { filename, contentType: "text/plain" });

    const { body: finished } = await upload("done.txt").expect(202);
    await runJobs();
    for (let i = 0; i < MAX_ACTIVE_JOBS_PER_USER; i++) await upload(`busy-${i}.txt`).expect(202);

    const events = captureEvents();
    const refusedUpload = await upload("one-too-many.txt").expect(429);
    events.stop();
    // The request's wide event says who was refused, and why.
    expect(events.named("http.request")).toEqual([
      expect.objectContaining({
        "http.request.method": "POST",
        "http.route": "/api/v1/document/upload",
        "http.response.status_code": 429,
        "app.user.id": expect.any(Number),
        "error.type": "TooManyJobsError",
      }),
    ]);
    // The code and values let the frontend word it; the message is the English, for curl.
    expect(ApiErrorResponseSchema.parse(refusedUpload.body)).toEqual({
      error: {
        code: "errors.jobs.tooManyActive",
        values: { count: MAX_ACTIVE_JOBS_PER_USER },
        message: t("errors.jobs.tooManyActive", { count: MAX_ACTIVE_JOBS_PER_USER }),
      },
    });
    const refusedJob = await busy
      .post("/api/v1/jobs")
      .send({ documentId: finished.document.id })
      .expect(429);
    expect(refusedJob.body.error).toMatchObject({ code: "errors.jobs.tooManyActive" });

    const { body: list } = await busy.get("/api/v1/document").expect(200);
    expect(list.documents).toHaveLength(MAX_ACTIVE_JOBS_PER_USER + 1);
  });

  it("hides one user's quiz and documents from another user", async () => {
    const bob = await loggedInAgent("bob@example.com");

    const { body: missing } = await bob.get(`/api/v1/quiz/${quiz.id}`).expect(404);
    expect(missing.error.code).toBe("errors.notFound.quiz");
    await bob.put(`/api/v1/quiz/${quiz.id}`).send({ title: "Mine now", questions: [] }).expect(404);
    await bob.get(`/api/v1/quiz/${quiz.id}/export`).expect(404);
    await bob.delete(`/api/v1/quiz/${quiz.id}`).expect(404);
    await bob.post("/api/v1/jobs").send({ documentId: quiz.documentId }).expect(404);
    const { body: aliceDocs } = await alice.get("/api/v1/document").expect(200);
    await bob.get(`/api/v1/jobs/${aliceDocs.documents[0].latestJob.id}`).expect(404);
    await bob.get(`/api/v1/document/${quiz.documentId}/file`).expect(404);

    const { body } = await bob.get("/api/v1/document").expect(200);
    expect(body.documents).toEqual([]);
  });

  it("deletes the quiz", async () => {
    await alice.delete(`/api/v1/quiz/${quiz.id}`).expect(204);
    await alice.get(`/api/v1/quiz/${quiz.id}`).expect(404);
  });
});

describe("authentication", () => {
  it("refuses a second account with the same email, with a message instead of a 500", async () => {
    await loggedInAgent("dupe@example.com");
    const again = await request(app)
      .post("/api/auth/sign-up/email")
      .set("Origin", ORIGIN)
      .send({ name: "Dupe", email: "dupe@example.com", password: PASSWORD });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(again.status).toBeLessThan(500);
    expect(again.body.message).toMatch(/already exists/i);
  });

  it("signs in a user migrated from the old login, whose password is a bcrypt hash", async () => {
    // The migration leaves existing users like this: a credential account holding their bcrypt hash.
    const user = await prisma.user.create({
      data: { email: "legacy@example.com", name: "Legacy" },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: String(user.id),
        providerId: "credential",
        password: await bcrypt.hash("OldPassword1", 10),
      },
    });

    const agent = request.agent(app);
    await signIn(agent, "legacy@example.com", "OldPassword1").expect(200);
    await agent.get("/api/v1/document").expect(200);
    await signIn(request.agent(app), "legacy@example.com", "WrongPassword1").expect(401);
  });

  it("signing out ends access to the API", async () => {
    const agent = await loggedInAgent("leaver@example.com");
    await agent.get("/api/v1/document").expect(200);
    await agent.post("/api/auth/sign-out").set("Origin", ORIGIN).send({}).expect(200);
    await agent.get("/api/v1/document").expect(401);
  });

  it("resets a forgotten password through the emailed link", async () => {
    await loggedInAgent("forgetful@example.com");
    const events = captureEvents();
    const redirectTo = `${ORIGIN}/update-password`;
    const sentBefore = email.outbox.length;

    await request(app)
      .post("/api/auth/request-password-reset")
      .set("Origin", ORIGIN)
      .send({ email: "forgetful@example.com", redirectTo })
      .expect(200);
    const sent = email.outbox.slice(sentBefore);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "forgetful@example.com", name: "Test User" });

    // The emailed link goes to the API, which redirects to the frontend page with the token.
    const link = new URL(sent[0].url);
    const followed = await request(app).get(link.pathname + link.search);
    expect(followed.status).toBe(302);
    const landing = new URL(followed.headers.location);
    expect(`${landing.origin}${landing.pathname}`).toBe(redirectTo);
    const token = landing.searchParams.get("token");
    expect(token).toBeTruthy();

    await request(app)
      .post("/api/auth/reset-password")
      .set("Origin", ORIGIN)
      .send({ newPassword: "NewPassword1", token })
      .expect(200);

    await signIn(request.agent(app), "forgetful@example.com", "NewPassword1").expect(200);
    await signIn(request.agent(app), "forgetful@example.com", PASSWORD).expect(401);

    // Events record the reset by user id, never by email address or token.
    events.stop();
    expect(events.named("email.password_reset")).toHaveLength(1);
    const written = JSON.stringify(events.lines);
    expect(written).not.toContain("forgetful");
    expect(written).not.toContain(token);
  });

  it("answers a reset request for an unknown email the same way, without sending anything", async () => {
    const sentBefore = email.outbox.length;
    await request(app)
      .post("/api/auth/request-password-reset")
      .set("Origin", ORIGIN)
      .send({ email: "nobody@example.com", redirectTo: `${ORIGIN}/update-password` })
      .expect(200);
    expect(email.outbox).toHaveLength(sentBefore);
  });
});
