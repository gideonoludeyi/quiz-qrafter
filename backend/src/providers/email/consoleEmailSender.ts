import type { EmailSender, PasswordResetEmail } from "./types";

// Offline sender: prints each email's link to the log and keeps it for tests to read.
export class ConsoleEmailSender implements EmailSender {
  readonly outbox: PasswordResetEmail[] = [];

  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    this.outbox.push(email);
    console.log(`[email] Password reset for ${email.to}: ${email.url}`);
  }
}
