import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";

const PASSWORD = "Password1";

// The auth forms validate one keystroke late, so nudge a field to refresh the submit button.
async function nudge(field: Locator) {
  await field.press("End");
  await field.pressSequentially("x");
  await field.press("Backspace");
}

// A document's row in the list.
const documentRow = (page: Page, filename: string) =>
  page.getByRole("navigation", { name: "Your documents" }).getByRole("button", {
    name: new RegExp(filename.replace(".", "\\.")),
  });

test("sign up, generate a quiz, edit it, and download the PDF", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await test.step("sign up, which signs in and opens the dashboard", async () => {
    await page.goto("/signup");
    await page.locator("#firstname").pressSequentially("Ada");
    await page.locator("#lastname").pressSequentially("Lovelace");
    await page.locator("#email").pressSequentially(email);
    await page.locator("#password").pressSequentially(PASSWORD);
    await nudge(page.locator("#lastname"));
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForURL("**/dashboard");
  });

  await test.step("upload notes and watch the quiz being written", async () => {
    await expect(page.getByText("Upload your notes to generate your first quiz.")).toBeVisible();
    // Choosing a file uploads it and opens it on the Quiz tab, which shows the progress.
    await page
      .getByLabel("Upload notes")
      .setInputFiles(path.join(import.meta.dirname, "fixtures/notes.txt"));

    await expect(page.getByText("Making a quiz from notes.txt")).toBeVisible();
    await expect(page.getByText(/Writing questions: \d+ written so far/)).toBeVisible();

    await expect(page.locator("#quiz-title")).toHaveValue("Sample quiz");
    await expect(page.getByTestId(/^question-\d+$/)).toHaveCount(3);
    await expect(documentRow(page, "notes.txt")).toContainText("Quiz ready");
    // The fake generator quotes the first sentence of the uploaded notes.
    await expect(page.getByTestId("question-1")).toContainText(
      "The water cycle moves water between the oceans, the air and the land.",
    );
  });

  await test.step("view the uploaded notes in the Viewer tab", async () => {
    await page.getByRole("tab", { name: "Viewer" }).click();
    await expect(page.getByTestId("document-viewer")).toContainText(
      "The water cycle moves water between the oceans, the air and the land.",
    );
    await page.getByRole("tab", { name: "Quiz" }).click();
  });

  await test.step("edit a question and save", async () => {
    await page.locator("#question-1-prompt").fill("Edited by the smoke test");
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Quiz saved.")).toBeVisible();
    await expect(page.getByText("Unsaved changes")).toBeHidden();
  });

  await test.step("the edit survives a reload", async () => {
    await page.reload();
    await expect(page.locator("#question-1-prompt")).toHaveValue("Edited by the smoke test");
  });

  await test.step("download the PDF", async () => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download PDF" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("quiz.pdf");
    const content = await readFile(await download.path());
    expect(content.subarray(0, 5).toString()).toBe("%PDF-");
  });

  await test.step("log out and log back in", async () => {
    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL("**/login");

    await page.locator("#email").pressSequentially(email);
    await page.locator("#password").pressSequentially(PASSWORD);
    await nudge(page.locator("#email"));
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/dashboard");
    // The session cookie set by the API (another port) is sent with API calls.
    await documentRow(page, "notes.txt").click();
    await page.getByRole("tab", { name: "Quiz" }).click();
    await expect(page.locator("#question-1-prompt")).toHaveValue("Edited by the smoke test");
  });

  await test.step("switch to dark theme from the nav bar", async () => {
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/\bdark\b/);
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();

    // The choice is remembered across a reload.
    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);
  });
});

test("a failed job shows why and can be retried", async ({ page }) => {
  const email = `e2e-fail-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.locator("#firstname").pressSequentially("Grace");
  await page.locator("#lastname").pressSequentially("Hopper");
  await page.locator("#email").pressSequentially(email);
  await page.locator("#password").pressSequentially(PASSWORD);
  await nudge(page.locator("#lastname"));
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/dashboard");

  // The fake AI fails on notes containing FAKE_FAIL.
  await page.getByLabel("Upload notes").setInputFiles({
    name: "broken.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("These notes say FAKE_FAIL."),
  });

  const alert = page.getByRole("alert").filter({ hasText: "couldn't be made" });
  await expect(alert).toContainText("The fake AI was asked to fail.");
  await expect(alert.getByRole("button", { name: "Try again" })).toBeEnabled();

  // The failure is still shown after a reload, and the list files it under Needs attention.
  await page.reload();
  await expect(alert).toContainText("The fake AI was asked to fail.");
  await expect(documentRow(page, "broken.txt")).toContainText("Failed");
});

test("a session that ends while editing a quiz sends you to sign in", async ({ page }) => {
  await page.goto("/signup");
  await page.locator("#firstname").pressSequentially("Ada");
  await page.locator("#lastname").pressSequentially("Lovelace");
  await page.locator("#email").pressSequentially(`e2e-session-${Date.now()}@example.com`);
  await page.locator("#password").pressSequentially(PASSWORD);
  await nudge(page.locator("#lastname"));
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/dashboard");

  await page
    .getByLabel("Upload notes")
    .setInputFiles(path.join(import.meta.dirname, "fixtures/notes.txt"));
  // The other tests' jobs share the e2e worker, so this one may wait its turn.
  await expect(page.locator("#quiz-title")).toHaveValue("Sample quiz", { timeout: 20_000 });

  await page.locator("#question-1-prompt").fill("Edited after the session ended");
  // As if the session expired, or was ended on another device.
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL("**/login");
});
