import bcrypt from "bcrypt";
import { Hono } from "hono";
import type { Deps } from "../../core/types";
import type { AppEnv } from "./env";
import { restrict, sendStatus, userIdOf } from "./http";

// Reads a JSON body, treating a missing or malformed body as empty (each route then returns 400).
async function bodyOf(c: {
  req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => ({}));
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

export default function authRouter({ prisma }: Deps) {
  const router = new Hono<AppEnv>();

  router.post("/signup", async (c) => {
    const { email, password, fullname } = await bodyOf(c);
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof fullname !== "string" ||
      !email ||
      !password ||
      !fullname
    ) {
      return sendStatus(c, 400);
    }

    const user = await prisma.user.create({
      data: { email, password: await hashPassword(password), fullname },
    });
    return c.json({ id: user.id, email: user.email, fullname: user.fullname }, 200);
  });

  router.post("/login", async (c) => {
    const { email, password } = await bodyOf(c);
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return sendStatus(c, 400);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user === null || !(await verifyPassword(password, user.password))) {
      return sendStatus(c, 404);
    }

    // The whole session lives in an encrypted cookie, so there is no server-side
    // session for an attacker to plant; no regeneration is needed on login.
    c.get("session").set("userId", user.id);
    return c.json({ id: user.id, email: user.email, fullname: user.fullname }, 200);
  });

  router.post("/logout", (c) => {
    c.get("session").deleteSession();
    return sendStatus(c, 200);
  });

  router.get("/info", restrict, async (c) => {
    const user = await prisma.user.findUnique({ where: { id: userIdOf(c) } });
    if (user === null) return sendStatus(c, 404);
    return c.json({ email: user.email, fullname: user.fullname }, 200);
  });

  return router;
}

async function hashPassword(plainPassword: string): Promise<string> {
  return await bcrypt.hash(plainPassword, 10);
}

async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(plainPassword, hashedPassword);
}
