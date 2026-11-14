import { t } from "@/i18n";
import { type AuthClient, createQuizQrafterAuthClient } from "./authClient";
import type { AuthService, LoginCredentials, SignUpInfo, User } from "./types";

type ClientError = { code?: string; message?: string; status: number } | null;

// What better-auth's error codes mean to the user; its own messages are English and technical.
const AUTH_ERRORS: Record<string, string> = {
  USER_ALREADY_EXISTS: "auth.errors.accountExists",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "auth.errors.accountExists",
  INVALID_EMAIL_OR_PASSWORD: "auth.errors.wrongCredentials",
  INVALID_EMAIL: "auth.errors.invalidEmail",
  PASSWORD_TOO_SHORT: "auth.errors.passwordTooShort",
  PASSWORD_TOO_LONG: "auth.errors.passwordTooLong",
  INVALID_TOKEN: "auth.errors.resetLinkInvalid",
  TOKEN_EXPIRED: "auth.errors.resetLinkInvalid",
  INVALID_PASSWORD: "auth.errors.wrongPassword",
};

// The words for a better-auth error: by its code, as a rate limit, or else `fallback`.
export function describeAuthError(error: NonNullable<ClientError>, fallback: string): string {
  const key = error.code === undefined ? undefined : AUTH_ERRORS[error.code];
  if (key !== undefined) return t(key);
  if (error.status === 429) return t("auth.errors.tooManyAttempts");
  return fallback;
}

function toUser(user: { email: string; name: string }): User {
  return { email: user.email, username: user.name };
}

// Throws the error in words for the user, never better-auth's own message.
function throwIfError(error: ClientError, fallback: string) {
  if (error) throw new Error(describeAuthError(error, fallback));
}

export class QuizQrafterAuthService implements AuthService {
  private readonly client: AuthClient;

  constructor(baseURL: URL) {
    this.client = createQuizQrafterAuthClient(baseURL);
  }

  async currentUser(): Promise<User | null> {
    const { data } = await this.client.getSession();
    return data ? toUser(data.user) : null;
  }

  async signUp(info: SignUpInfo): Promise<User> {
    const { data, error } = await this.client.signUp.email({
      name: info.fullname,
      email: info.email,
      password: info.password,
    });
    throwIfError(error, t("auth.errors.signUpFailed"));
    return toUser(data!.user);
  }

  async login(credentials: LoginCredentials): Promise<User> {
    const { data, error } = await this.client.signIn.email(credentials);
    throwIfError(error, t("auth.errors.logInFailed"));
    return toUser(data!.user);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.signOut();
    throwIfError(error, t("auth.errors.signOutFailed"));
  }

  async deleteAccount(password: string): Promise<void> {
    const { error } = await this.client.deleteUser({ password });
    throwIfError(error, t("auth.errors.deleteAccountFailed"));
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.client.requestPasswordReset({ email, redirectTo });
    throwIfError(error, t("auth.errors.resetRequestFailed"));
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const { error } = await this.client.resetPassword({ token, newPassword });
    throwIfError(error, t("auth.errors.resetFailed"));
  }
}
