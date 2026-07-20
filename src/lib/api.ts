import { NextResponse } from "next/server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";

/** Helpers shared across API route handlers (multi-user, role-aware). */

export type AuthedUser = { id: string; email: string | null; role: Role };

/**
 * Require a signed-in user. Returns the session user (id + role) so handlers can
 * scope every query by `user.id` — the core isolation guarantee (§2.1).
 */
export async function requireUser(): Promise<
  { ok: true; user: AuthedUser } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return {
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      role: session.user.role,
    },
  };
}

/** Require an admin. Non-admins get 403, not 401, so the UI can distinguish. */
export async function requireAdmin(): Promise<
  { ok: true; user: AuthedUser } | { ok: false; response: NextResponse }
> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  if (guard.user.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return guard;
}

export function badRequest(error: z.ZodError | string): NextResponse {
  const details =
    typeof error === "string"
      ? error
      : error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return NextResponse.json({ error: details }, { status: 400 });
}

export function serverError(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ error: message }, { status: 500 });
}
