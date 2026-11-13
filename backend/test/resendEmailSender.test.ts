import { describe, expect, it, vi } from "vite-plus/test";
import { type ResendClient, ResendEmailSender } from "../src/providers/email/resendEmailSender";

const FROM = "Quiz Qrafter <onboarding@resend.dev>";
const URL =
  "http://localhost:8080/api/auth/reset-password/abc?callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fupdate-password";

// A stub Resend client whose send() returns the given result.
function stubClient(result: Awaited<ReturnType<ResendClient["emails"]["send"]>>) {
  const send = vi.fn(async (_message: unknown) => result);
  return { client: { emails: { send } } as unknown as ResendClient, send };
}

const OK = { data: { id: "email-1" }, error: null, headers: null } as const;

describe("ResendEmailSender", () => {
  it("sends the reset link from the configured address, in HTML and text", async () => {
    const { client, send } = stubClient(OK);
    await new ResendEmailSender("key", FROM, client).sendPasswordReset({
      to: "ada@example.com",
      name: "Ada",
      url: URL,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0] as Record<string, string>;
    expect(message).toMatchObject({
      from: FROM,
      to: "ada@example.com",
      subject: "Reset your Quiz Qrafter password",
    });
    // The HTML escapes "&" in the URL; the text has it as-is.
    expect(message.html).toContain(URL.replaceAll("&", "&amp;"));
    expect(message.html).toContain("Hi Ada,");
    expect(message.text).toContain(URL);
  });

  it("escapes the user's name in the HTML", async () => {
    const { client, send } = stubClient(OK);
    await new ResendEmailSender("key", FROM, client).sendPasswordReset({
      to: "x@example.com",
      name: '<script>alert("hi")</script>',
      url: URL,
    });
    const { html } = send.mock.calls[0][0] as Record<string, string>;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("throws when Resend reports an error", async () => {
    const { client } = stubClient({
      data: null,
      error: { message: "The from address is not verified", name: "validation_error" },
      headers: null,
    } as never);
    await expect(
      new ResendEmailSender("key", FROM, client).sendPasswordReset({
        to: "x@example.com",
        name: "X",
        url: URL,
      }),
    ).rejects.toThrow(/not verified/);
  });
});
