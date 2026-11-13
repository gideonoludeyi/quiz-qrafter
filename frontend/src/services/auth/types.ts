export interface AuthService {
  currentUser(): Promise<User | null>;
  // Creates the account and signs the user in.
  signUp(info: SignUpInfo): Promise<User>;
  login(credentials: LoginCredentials): Promise<User>;
  signOut(): Promise<void>;
  // Emails a reset link if the address has an account; resolves the same way either way.
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
}

export type User = {
  email: string;
  username: string;
};

export type SignUpInfo = {
  email: string;
  password: string;
  fullname: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};
