import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError } from "@/lib/api";
import { verifyPassword } from "@/lib/password";
import { createDbSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const input = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/login → verify email/password and start a session.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = input.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  // Same generic error whether the email or the password is wrong.
  if (!user?.passwordHash || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  try {
    const res = NextResponse.json({ ok: true });
    await createDbSession(user.id, res, new URL(request.url).protocol === "https:");
    return res;
  } catch (err) {
    return serverError(err);
  }
}
