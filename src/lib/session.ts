import { randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Mint an Auth.js-compatible database session and attach the session cookie to
 * a response. Used by the email/password login + signup and the dev-login.
 * Because the app uses the database session strategy, `auth()` resolves this
 * session via the Prisma adapter on the next request.
 */
const SESSION_DAYS = 30;

export async function createDbSession(
  userId: string,
  res: NextResponse,
  secure: boolean,
): Promise<void> {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { sessionToken, userId, expires } });

  const cookieName = secure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  res.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires,
  });
}
