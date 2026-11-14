import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { anyCount, t } from "./i18n";

const PASSWORD = "Password1";

// The auth forms validate one keystroke late, so nudge a field to refresh the submit button.
async function nudge(field: Locator) {
  await field.press("End");
  await field.pressSequentially("x");
  await field.press("Backspace");
}

// A document's row in the list.
const documentRow = (page: Page, filename: string) =>
  page.getByRole("navigation", { name: t("documents.listLabel") }).getByRole("button", {
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
    await page.getByRole("button", { name: t("auth.signUp") }).click();
    await page.waitForURL("**/dashboard");
  });

  await test.step("upload notes and watch the quiz being written", async () => {
    await expect(page.getByText(t("documents.empty"))).toBeVisible();
    // Choosing a file uploads it and opens it on the Quiz tab, which shows the progress.
    await page
      .getByLabel(t("documents.uploadLabel"))
      .setInputFiles(path.join(import.meta.dirname, "fixtures/notes.txt"));

    await expect(page.getByText(t("jobs.making", { filename: "notes.txt" }))).toBeVisible();
    await expect(page.getByText(anyCount("jobs.stage.writingProgress"))).toBeVisible();

    await expect(page.locator("#quiz-title")).toHaveValue("Sample quiz");
    await expect(page.getByTestId(/^question-\d+$/)).toHaveCount(3);
    await expect(documentRow(page, "notes.txt")).toContainText(t("documents.summary.ready"));
    // The fake generator quotes the first sentence of the uploaded notes.
    await expect(page.getByTestId("question-1")).toContainText(
      "The water cycle moves water between the oceans, the air and the land.",
    );
  });

  await test.step("view the uploaded notes in the Viewer tab", async () => {
    await page.getByRole("tab", { name: t("documents.tabs.viewer") }).click();
    await expect(page.getByTestId("document-viewer")).toContainText(
      "The water cycle moves water between the oceans, the air and the land.",
    );
    await page.getByRole("tab", { name: t("documents.tabs.quiz") }).click();
  });

  await test.step("edit a question and save", async () => {
    await page.locator("#question-1-prompt").fill("Edited by the smoke test");
    await expect(page.getByText(t("quiz.unsavedChanges"))).toBeVisible();
    await page.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("quiz.saved"))).toBeVisible();
    await expect(page.getByText(t("quiz.unsavedChanges"))).toBeHidden();
  });

  await test.step("the edit survives a reload", async () => {
    await page.reload();
    await expect(page.locator("#question-1-prompt")).toHaveValue("Edited by the smoke test");
  });

  await test.step("download the PDF", async () => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: t("quiz.downloadPdf") }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("quiz.pdf");
    const content = await readFile(await download.path());
    expect(content.subarray(0, 5).toString()).toBe("%PDF-");
  });

  await test.step("log out and log back in", async () => {
    await page.getByRole("button", { name: t("auth.logOut") }).click();
    await page.waitForURL("**/login");

    await page.locator("#email").pressSequentially(email);
    await page.locator("#password").pressSequentially(PASSWORD);
    await nudge(page.locator("#email"));
    await page.getByRole("button", { name: t("auth.logIn") }).click();
    await page.waitForURL("**/dashboard");
    // The session cookie set by the API (another port) is sent with API calls.
    await documentRow(page, "notes.txt").click();
    await page.getByRole("tab", { name: t("documents.tabs.quiz") }).click();
    await expect(page.locator("#question-1-prompt")).toHaveValue("Edited by the smoke test");
  });

  await test.step("switch to dark theme from the nav bar", async () => {
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/\bdark\b/);
    await page.getByRole("button", { name: t("common.theme.switchToDark") }).click();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(page.getByRole("button", { name: t("common.theme.switchToLight") })).toBeVisible();

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
  await page.getByRole("button", { name: t("auth.signUp") }).click();
  await page.waitForURL("**/dashboard");

  // The fake AI fails on notes containing FAKE_FAIL.
  await page.getByLabel(t("documents.uploadLabel")).setInputFiles({
    name: "broken.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("These notes say FAKE_FAIL."),
  });

  const alert = page
    .getByRole("alert")
    .filter({ hasText: t("jobs.failed", { filename: "broken.txt" }) });
  await expect(alert).toContainText(t("errors.jobs.fakeFailure"));
  await expect(alert.getByRole("button", { name: t("common.tryAgain") })).toBeEnabled();

  // The failure is still shown after a reload, and the list files it under Needs attention.
  await page.reload();
  await expect(alert).toContainText(t("errors.jobs.fakeFailure"));
  await expect(documentRow(page, "broken.txt")).toContainText(t("documents.summary.failed"));
});

test("a session that ends while editing a quiz sends you to sign in", async ({ page }) => {
  await page.goto("/signup");
  await page.locator("#firstname").pressSequentially("Ada");
  await page.locator("#lastname").pressSequentially("Lovelace");
  await page.locator("#email").pressSequentially(`e2e-session-${Date.now()}@example.com`);
  await page.locator("#password").pressSequentially(PASSWORD);
  await nudge(page.locator("#lastname"));
  await page.getByRole("button", { name: t("auth.signUp") }).click();
  await page.waitForURL("**/dashboard");

  await page
    .getByLabel(t("documents.uploadLabel"))
    .setInputFiles(path.join(import.meta.dirname, "fixtures/notes.txt"));
  // The other tests' jobs share the e2e worker, so this one may wait its turn.
  await expect(page.locator("#quiz-title")).toHaveValue("Sample quiz", { timeout: 20_000 });

  await page.locator("#question-1-prompt").fill("Edited after the session ended");
  // As if the session expired, or was ended on another device.
  await page.context().clearCookies();
  await page.getByRole("button", { name: t("common.save") }).click();
  await page.waitForURL("**/login");
});

test("delete a quiz, then its document, then the account", async ({ page }) => {
  const email = `e2e-delete-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.locator("#firstname").pressSequentially("Marie");
  await page.locator("#lastname").pressSequentially("Curie");
  await page.locator("#email").pressSequentially(email);
  await page.locator("#password").pressSequentially(PASSWORD);
  await nudge(page.locator("#lastname"));
  await page.getByRole("button", { name: t("auth.signUp") }).click();
  await page.waitForURL("**/dashboard");

  await page
    .getByLabel(t("documents.uploadLabel"))
    .setInputFiles(path.join(import.meta.dirname, "fixtures/notes.txt"));
  // The other tests' jobs share the e2e worker, so this one may wait its turn.
  await expect(page.locator("#quiz-title")).toHaveValue("Sample quiz", { timeout: 20_000 });
  const dialog = page.getByRole("dialog");

  await test.step("delete the quiz, which leaves the document", async () => {
    await page.getByRole("button", { name: t("quiz.delete") }).click();
    await dialog.getByRole("button", { name: t("quiz.delete") }).click();
    await expect(page.getByText(t("quiz.deleted"))).toBeVisible();
    await expect(page.getByRole("button", { name: t("quiz.generate") })).toBeVisible();
    await expect(documentRow(page, "notes.txt")).toContainText(t("documents.summary.notStarted"));
  });

  await test.step("delete the document", async () => {
    await page.getByRole("button", { name: t("documents.delete") }).click();
    await expect(dialog).toContainText(t("documents.confirmDelete.description"));
    await dialog.getByRole("button", { name: t("documents.delete") }).click();
    await expect(page.getByText(t("documents.deleted"))).toBeVisible();
    await expect(page.getByText(t("documents.empty"))).toBeVisible();
  });

  await test.step("a wrong password doesn't delete the account", async () => {
    await page.getByRole("button", { name: t("auth.deleteAccount") }).click();
    await page.getByLabel(t("auth.deleteAccountDialog.passwordLabel")).fill("WrongPassword1");
    await dialog.getByRole("button", { name: t("auth.deleteAccountDialog.submit") }).click();
    await expect(dialog).toContainText(t("auth.errors.wrongPassword"));
  });

  await test.step("delete the account, which signs out for good", async () => {
    await page.getByLabel(t("auth.deleteAccountDialog.passwordLabel")).fill(PASSWORD);
    await dialog.getByRole("button", { name: t("auth.deleteAccountDialog.submit") }).click();
    await page.waitForURL("**/login");

    await page.locator("#email").pressSequentially(email);
    await page.locator("#password").pressSequentially(PASSWORD);
    await nudge(page.locator("#email"));
    await page.getByRole("button", { name: t("auth.logIn") }).click();
    await expect(page.getByText(t("auth.errors.wrongCredentials"))).toBeVisible();
    expect(page.url()).toMatch(/\/login$/);
  });
});
