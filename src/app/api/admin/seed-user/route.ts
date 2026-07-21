import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { hashPassword } from "@/lib/password";
import { CONSENT_VERSION } from "@/lib/consent";

/**
 * Gated test-account creator. Creates (or resets the password of) an
 * email/password account you can log in with on the normal form. The account is
 * made admin and has the authorization pre-signed so it skips onboarding
 * consent — purely for testing.
 *
 *   GET /api/admin/seed-user?secret=<DEV_LOGIN_SECRET>&email=you@test.com&password=whatever
 *
 * Requires the v3 schema to exist (run /api/admin/migrate first). Gated by
 * DEV_LOGIN_SECRET — leave that unset in a locked-down production env.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = env().DEV_LOGIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Disabled (set DEV_LOGIN_SECRET to enable)." },
      { status: 404 },
    );
  }
  const url = new URL(request.url);
  if (url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Bad secret" }, { status: 401 });
  }

  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const password = url.searchParams.get("password") ?? "";
  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Provide ?email=&password= (password >= 8 chars)." },
      { status: 400 },
    );
  }

  try {
    const data = {
      passwordHash: hashPassword(password),
      role: "admin" as const,
      // Pre-sign the authorization so testing skips the consent gate.
      authorizationSignedAt: new Date(),
      consentVersion: CONSENT_VERSION,
      residencyState: "CA",
    };
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, ...data },
      update: data,
    });
    return NextResponse.json({
      ok: true,
      email: user.email,
      role: user.role,
      message: "Account ready — log in with this email + password on /login.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        hint: /passwordHash|column|relation|does not exist/i.test(msg)
          ? "Run /api/admin/migrate?secret=...&reset=true first to create the v3 schema."
          : undefined,
      },
      { status: 500 },
    );
  }
}
