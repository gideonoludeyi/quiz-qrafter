import { Resend } from "resend";
import { t } from "../../i18n";
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
    const { error } = await this.client.emails.send({
      from: this.from,
      to,
      subject: t("email.passwordReset.subject"),
      html: `<p>${escapeHtml(t("email.passwordReset.greeting", { name }))}</p>
<p>${escapeHtml(t("email.passwordReset.intro"))}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#18181b;color:#ffffff;text-decoration:none">${escapeHtml(t("email.passwordReset.button"))}</a></p>
<p>${escapeHtml(t("email.passwordReset.expiry"))}</p>`,
      text: `${t("email.passwordReset.greeting", { name })}

${t("email.passwordReset.intro")}

${url}

${t("email.passwordReset.expiry")}`,
    });
    if (error) {
      throw new Error(`The password reset email to ${to} was not sent: ${error.message}`);
    }
  }
}
