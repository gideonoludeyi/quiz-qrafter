export type PasswordResetEmail = {
  to: string;
  name: string;
  url: string;
};

// Sends the app's transactional emails.
export interface EmailSender {
  sendPasswordReset(email: PasswordResetEmail): Promise<void>;
}
