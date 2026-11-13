import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, test } from "@playwright/test";

const PASSWORD = "Password1";

// The auth forms validate one keystroke late, so nudge a field to refresh the submit button.
async function nudge(field: Locator) {
  await field.press("End");
  await field.pressSequentially("x");
  await field.press("Backspace");
}

test("sign up, generate a quiz, edit it, and download the PDF", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.locator("#firstname").pressSequentially("Ada");
    await page.locator("#lastname").pressSequentially("Lovelace");
    await page.locator("#email").pressSequentially(email);
    await page.locator("#password").pressSequentially(PASSWORD);
    await nudge(page.locator("#lastname"));
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForURL("**/login");
  });

  await test.step("log in", async () => {
    await page.locator("#email").pressSequentially(email);
    await page.locator("#password").pressSequentially(PASSWORD);
    await nudge(page.locator("#email"));
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/dashboard");
  });

  await test.step("upload notes and get a quiz", async () => {
    await expect(page.getByText("Upload your notes to generate your first quiz.")).toBeVisible();
    await page.getByLabel("Choose File").setInputFiles(path.join(__dirname, "fixtures/notes.txt"));
    await page.getByRole("button", { name: "Upload & generate" }).click();

    await expect(page.locator("#quiz-title")).toHaveValue("Sample quiz");
    await expect(page.getByTestId(/^question-\d+$/)).toHaveCount(3);
    await expect(page.getByRole("button", { name: "notes.txt" })).toBeVisible();
    // The fake generator quotes the first sentence of the uploaded notes.
    await expect(page.getByTestId("question-1")).toContainText(
      "The water cycle moves water between the oceans, the air and the land.",
    );
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
});
