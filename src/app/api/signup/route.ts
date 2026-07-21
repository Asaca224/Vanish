import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { badRequest, serverError } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { createDbSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const input = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// POST /api/signup → create an email/password account and sign in.
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
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return badRequest("An account with that email already exists — log in instead.");
  }

  try {
    const role = email === env().OPERATOR_EMAIL.toLowerCase() ? "admin" : "user";
    const user = await prisma.user.create({
      data: { email, passwordHash: hashPassword(parsed.data.password), role },
    });
    const res = NextResponse.json({ ok: true }, { status: 201 });
    await createDbSession(user.id, res, new URL(request.url).protocol === "https:");
    return res;
  } catch (err) {
    return serverError(err);
  }
}
