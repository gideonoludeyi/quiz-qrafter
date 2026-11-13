import { createEmailSender } from "@better-auth/infra/email";
import type { EmailSender, PasswordResetEmail } from "./types";

// Sends emails through better-auth's hosted email service, with its templates.
export class BetterAuthEmailSender implements EmailSender {
  private readonly sender: ReturnType<typeof createEmailSender>;

  constructor(apiKey: string) {
    this.sender = createEmailSender({ apiKey });
  }

  async sendPasswordReset({ to, name, url }: PasswordResetEmail): Promise<void> {
    const result = await this.sender.send({
      template: "reset-password",
      to,
      variables: { resetLink: url, userEmail: to, userName: name, appName: "Quiz Qrafter" },
    });
    if (!result.success) {
      throw new Error(`The password reset email to ${to} was not sent: ${result.error}`);
    }
  }
}
