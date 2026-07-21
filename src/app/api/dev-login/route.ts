import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { createDbSession } from "@/lib/session";

/**
 * Gated dev/local login. Enabled ONLY when DEV_LOGIN_SECRET is set. Mints a
 * session for a designated account for one-click admin access.
 *
 *   GET /api/dev-login?secret=<DEV_LOGIN_SECRET>[&email=you@example.com]
 *
 * Defaults to OPERATOR_EMAIL and grants the admin role. Leave DEV_LOGIN_SECRET
 * unset in a real production environment to disable this.
 */
export const dynamic = "force-dynamic";

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

  const res = NextResponse.redirect(new URL("/", url.origin));
  await createDbSession(user.id, res, url.protocol === "https:");
  return res;
}
