import bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { dash } from "@better-auth/infra";
import type { Config } from "./config";
import type { Deps } from "./core/types";
import { withWideEvent } from "./observability/events";

// Configures better-auth: email and password sign-in, sessions in Postgres, password reset emails.
export function createAuth(config: Config, { prisma, providers }: Deps) {
  return betterAuth({
    plugins: [dash()],
    appName: "Quiz Qrafter",
    baseURL: config.auth.baseURL,
    secret: config.auth.secret,
    trustedOrigins: config.frontendOrigins,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      // bcrypt, which existing users' passwords were hashed with.
      password: {
        hash: (password) => bcrypt.hash(password, 10),
        verify: ({ hash, password }) => bcrypt.compare(password, hash),
      },
      sendResetPassword: async ({ user, url }) => {
        // Not awaited, so the response time doesn't reveal whether the email has an account.
        void withWideEvent("email.password_reset", { "app.user.id": Number(user.id) }, () =>
          providers.email.sendPasswordReset({ to: user.email, name: user.name, url }),
        ).catch(() => {}); // The event records the failure.
      },
    },
    advanced: {
      // Numeric ids, which users, documents and quizzes already use.
      database: { generateId: "serial" },
      // The frontend and API are on different sites in production, so cookies must allow that.
      ...(config.isProduction && {
        defaultCookieAttributes: { sameSite: "none", secure: true },
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
