import bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { Config } from "./config";
import { deleteAllDocuments } from "./core/documents";
import type { Deps } from "./core/types";
import { annotate, withWideEvent } from "./observability/events";

// Configures better-auth: email and password sign-in, sessions in Postgres, password reset emails.
export function createAuth(config: Config, deps: Deps) {
  const { prisma, providers } = deps;
  return betterAuth({
    appName: "Quiz Qrafter",
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
    user: {
      // Deleting an account deletes the user's documents, quizzes and stored files for good.
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          annotate({ "app.user.id": Number(user.id) });
          await deleteAllDocuments(deps, Number(user.id));
        },
      },
    },
    hooks: {
      // better-auth would accept a recent session instead; deleting an account always needs the password.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/delete-user" && !ctx.body?.password) {
          throw new APIError("BAD_REQUEST", {
            code: "INVALID_PASSWORD",
            message: "Password is required",
          });
        }
      }),
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
