import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";

/**
 * Gated dev/local login (bypasses Google OAuth).
 *
 * Enabled ONLY when DEV_LOGIN_SECRET is set. Mints a real database session for a
 * designated account so you can get into the app while the Google consent screen
 * is still in "testing". Because the app uses the database session strategy, we
 * create the Session row + set the session cookie directly (the Credentials
 * provider isn't compatible with database sessions in Auth.js v5).
 *
 *   GET /api/dev-login?secret=<DEV_LOGIN_SECRET>[&email=you@example.com]
 *
 * The account defaults to OPERATOR_EMAIL and is granted the admin role. Leave
 * DEV_LOGIN_SECRET unset in a real production environment to disable this.
 */
export const dynamic = "force-dynamic";

const SESSION_DAYS = 30;

export async function GET(request: Request) {
  const secret = env().DEV_LOGIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Dev login is disabled (set DEV_LOGIN_SECRET to enable)." },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Bad secret" }, { status: 401 });
  }

  const operator = env().OPERATOR_EMAIL.toLowerCase();
  const email = (url.searchParams.get("email") ?? operator).toLowerCase();
  const role = email === operator ? "admin" : "user";

  // Upsert the user (created users have no accounts row — that's fine for the
  // database session lookup, which only needs the Session + User).
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, role },
    update: { role },
  });

  // Create a session the Prisma adapter will resolve on the next request.
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires },
  });

  // Match Auth.js v5 cookie naming: __Secure- prefix on https.
  const secure = url.protocol === "https:";
  const cookieName = secure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const res = NextResponse.redirect(new URL("/", url.origin));
  res.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires,
  });
  return res;
}
