import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { anyCount, t } from "./i18n";

// Screenshots for the README, saved to docs/assets/. Run with `npm run screenshots`.

const ASSETS = path.join(import.meta.dirname, "..", "docs", "assets");
const EMAIL = "ada@example.com";
const PASSWORD = "Password1";
// The e2e API, and the frontend origin better-auth trusts (see playwright.config.ts).
const API = "http://localhost:8090";
const ORIGIN = "http://localhost:3100";

test.skip(!process.env.SCREENSHOTS, "Only runs with SCREENSHOTS=1 (npm run screenshots).");
test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce", colorScheme: "light" });

// The auth forms validate one keystroke late, so nudge a field to refresh the submit button.
async function nudge(field: Locator) {
  await field.press("End");
  await field.pressSequentially("x");
  await field.press("Backspace");
}

const CELL_NOTES = `Cells are the basic unit of life. The nucleus holds the cell's DNA.
Mitochondria produce ATP, the energy currency of the cell.
Ribosomes build proteins from amino acids.`;

// Deletes the screenshot account, if it exists, so every run can sign up as the same person.
async function deleteAccount(page: Page) {
  const signedIn = await page.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { Origin: ORIGIN },
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!signedIn.ok()) return;
  await page.request.post(`${API}/api/auth/delete-user`, {
    headers: { Origin: ORIGIN },
    data: { password: PASSWORD },
  });
}

test("README screenshots", async ({ page }) => {
  // Without transitions, so a shot never catches a colour fading out, such as a cleared error outline.
  const shot = async (name: string) => {
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
    await page.screenshot({ path: path.join(ASSETS, `${name}.png`) });
  };
  await deleteAccount(page);

  await page.goto("/");
  // Wait until every image has loaded, so the landing page isn't half empty.
  await page.waitForFunction(() =>
    Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
  );
  await shot("home");

  await page.goto("/signup");
  await page.locator("#firstname").pressSequentially("Ada");
  await page.locator("#lastname").pressSequentially("Lovelace");
  await page.locator("#email").pressSequentially(EMAIL);
  await page.locator("#password").pressSequentially(PASSWORD);
  await nudge(page.locator("#lastname"));
  // A filled-in, valid form: Sign up enabled, and no field focused or outlined.
  await expect(page.getByRole("button", { name: t("auth.signUp") })).toBeEnabled();
  await page.locator("#lastname").blur();
  await shot("signup");
  await page.getByRole("button", { name: t("auth.signUp") }).click();
  await page.waitForURL("**/dashboard");

  const upload = page.getByLabel(t("documents.uploadLabel"));
  await upload.setInputFiles({
    name: "cell-biology.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(CELL_NOTES),
  });
  await expect(page.locator("#quiz-title")).toHaveValue("Sample quiz", { timeout: 20_000 });

  // A second document, caught while its quiz is being written.
  await upload.setInputFiles(path.join(import.meta.dirname, "fixtures/notes.txt"));
  await expect(page.getByText(anyCount("jobs.stage.writingProgress"))).toBeVisible();
  await shot("quiz-in-progress");

  await expect(page.locator("#quiz-title")).toHaveValue("Sample quiz", { timeout: 20_000 });
  // Let the "quiz ready" toast go before the dashboard shot.
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });
  await shot("dashboard");

  await deleteAccount(page);
});
