import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Self-contained session layer (no NextAuth/OAuth). We store a random session
 * token in a cookie and resolve it against the Session table. This removes any
 * dependency on an OAuth provider and any cookie-name ambiguity — email/password
 * login (and dev-login) mint sessions here; getSession() reads them everywhere.
 */

const COOKIE = "vanish_session";
const SESSION_DAYS = 30;

export type SessionUser = { id: string; email: string | null; role: Role };
export type AppSession = { user: SessionUser };

// Mint a session and attach the cookie to an API-route response.
export async function createDbSession(
  userId: string,
  res: NextResponse,
  secure: boolean,
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { sessionToken: token, userId, expires } });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires,
  });
}

// Read the current session (server components, route handlers, server actions).
export async function getSession(): Promise<AppSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    include: { user: true },
  });
  if (!session || session.expires < new Date()) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    },
  };
}

// Clear the session (used by sign-out server action).
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { sessionToken: token } });
  }
  jar.delete(COOKIE);
}
