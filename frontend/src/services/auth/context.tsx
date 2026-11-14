import React, { createContext, useContext, useEffect, useState } from "react";
import { AuthService, User } from "./types";

type AuthContextValue = {
  user: User | null;
  // True until the first check for an existing session has finished.
  initializing: boolean;
  loading: boolean;
  error: Error | null;
  authenticated: boolean;
  // Both reject with the reason when the request fails.
  signUp: (email: string, password: string, fullname: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  // Deletes the account and forgets the user; rejects with the reason, such as a wrong password.
  deleteAccount: (password: string) => Promise<void>;
  // Forgets the user without asking the server, after an API request answers 401.
  sessionLost: () => void;
  // Both reject with the reason when the request fails.
  requestPasswordReset: (email: string, redirectTo: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  service: AuthService;
  children: React.ReactNode;
};

export function AuthProvider({ service, children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    service
      .currentUser()
      .then(setUser)
      .catch(setError)
      .finally(() => setInitializing(false));
  }, [service]);

  const signUp = (email: string, password: string, fullname: string) => {
    setLoading(true);
    return service
      .signUp({ email, password, fullname })
      .then((user) => {
        // Signing up also signs the user in.
        setUser(user);
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        setError(err);
        throw err;
      })
      .finally(() => setLoading(false));
  };

  const login = (email: string, password: string) => {
    setLoading(true);
    return service
      .login({ email, password })
      .then((user) => {
        setUser(user);
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        setError(err);
        throw err;
      })
      .finally(() => setLoading(false));
  };

  const signOut = () => {
    setLoading(true);
    service
      .signOut()
      .then(() => {
        setUser(null);
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        setError(err);
      })
      .finally(() => setLoading(false));
  };

  const deleteAccount = (password: string) =>
    service.deleteAccount(password).then(() => {
      setUser(null);
      setError(null);
    });

  return (
    <AuthContext.Provider
      value={{
        user,
        initializing,
        loading,
        error,
        authenticated: user !== null,
        signUp,
        login,
        signOut,
        deleteAccount,
        sessionLost: () => setUser(null),
        requestPasswordReset: (email, redirectTo) =>
          service.requestPasswordReset(email, redirectTo),
        resetPassword: (token, newPassword) => service.resetPassword(token, newPassword),
      }}
      children={children}
    />
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (auth === null)
    throw new Error("useAuth() may only be used within the context of a <AuthProvider> component.");
  return auth;
}
