import { type AuthClient, createQuizQrafterAuthClient } from "./authClient";
import type { AuthService, LoginCredentials, SignUpInfo, User } from "./types";

type ClientError = { message?: string; status: number } | null;

function toUser(user: { email: string; name: string }): User {
  return { email: user.email, username: user.name };
}

// Throws better-auth's message (e.g. "User already exists") or the fallback.
function throwIfError(error: ClientError, fallback: string) {
  if (error) throw new Error(error.message || `${fallback} (${error.status})`);
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
    throwIfError(error, "Could not create the account");
    return toUser(data!.user);
  }

  async login(credentials: LoginCredentials): Promise<User> {
    const { data, error } = await this.client.signIn.email(credentials);
    throwIfError(error, "Invalid email or password");
    return toUser(data!.user);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.signOut();
    throwIfError(error, "Could not sign out");
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.client.requestPasswordReset({ email, redirectTo });
    throwIfError(error, "Could not send the reset link");
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const { error } = await this.client.resetPassword({ token, newPassword });
    throwIfError(error, "Could not update the password");
  }
}
