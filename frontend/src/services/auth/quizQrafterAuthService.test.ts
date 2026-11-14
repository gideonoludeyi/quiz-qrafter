import { describe, expect, it } from "vite-plus/test";
import { t } from "@/i18n";
import { describeAuthError } from "./quizQrafterAuthService";

describe("describeAuthError", () => {
  const fallback = "Fallback.";

  it("words better-auth's codes from the catalogue, never with its own message", () => {
    const exists = { code: "USER_ALREADY_EXISTS", message: "User already exists.", status: 422 };
    expect(describeAuthError(exists, fallback)).toBe(t("auth.errors.accountExists"));
    const wrong = { code: "INVALID_PASSWORD", message: "Invalid password", status: 400 };
    expect(describeAuthError(wrong, fallback)).toBe(t("auth.errors.wrongPassword"));
  });

  it("calls a rate limit what it is, and falls back for anything else", () => {
    expect(describeAuthError({ status: 429 }, fallback)).toBe(t("auth.errors.tooManyAttempts"));
    expect(describeAuthError({ code: "SOMETHING_NEW", status: 400 }, fallback)).toBe(fallback);
  });
});
