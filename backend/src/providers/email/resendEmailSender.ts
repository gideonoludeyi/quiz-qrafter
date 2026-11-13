import { Resend } from "resend";
import type { EmailSender, PasswordResetEmail } from "./types";

// The part of the Resend client this sender uses, so tests can pass a stub.
export type ResendClient = { emails: { send: Resend["emails"]["send"] } };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Sends emails through Resend.
export class ResendEmailSender implements EmailSender {
  private readonly client: ResendClient;

  constructor(
    apiKey: string,
    private readonly from: string,
    client?: ResendClient,
  ) {
    this.client = client ?? new Resend(apiKey);
  }

  async sendPasswordReset({ to, name, url }: PasswordResetEmail): Promise<void> {
    const safeName = escapeHtml(name);
    const safeUrl = escapeHtml(url);
    const { error } = await this.client.emails.send({
      from: this.from,
      to,
      subject: "Reset your Quiz Qrafter password",
      html: `<p>Hi ${safeName},</p>
<p>Someone asked to reset the password for your Quiz Qrafter account. To choose a new one, use this link:</p>
<p><a href="${safeUrl}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#18181b;color:#ffffff;text-decoration:none">Reset password</a></p>
<p>This link expires in 1 hour. If you didn't ask for this, ignore this email; your password won't change.</p>`,
      text: `Hi ${name},

Someone asked to reset the password for your Quiz Qrafter account. To choose a new one, open this link:

${url}

This link expires in 1 hour. If you didn't ask for this, ignore this email; your password won't change.`,
    });
    if (error) {
      throw new Error(`The password reset email to ${to} was not sent: ${error.message}`);
    }
  }
}
