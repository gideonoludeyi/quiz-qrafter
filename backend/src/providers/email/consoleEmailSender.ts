import type { EmailSender, PasswordResetEmail } from "./types";

// Offline sender for development: prints each reset link and keeps it for tests. Refused in production.
export class ConsoleEmailSender implements EmailSender {
  readonly outbox: PasswordResetEmail[] = [];

  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    this.outbox.push(email);
    // Written directly, not as a log line: redaction would hide the link this exists to show.
    process.stdout.write(`[email] Password reset for ${email.to}: ${email.url}\n`);
  }
}
