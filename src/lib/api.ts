import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";

/** Small helpers shared across API route handlers. */

export async function requireOperator(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true };
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
