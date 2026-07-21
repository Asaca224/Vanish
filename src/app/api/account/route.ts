import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { badRequest, requireUser, serverError } from "@/lib/api";
import { signAuthorizationInput, updateAccountInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET /api/account → the user's account status (non-PII).
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const user = await prisma.user.findUnique({
    where: { id: guard.user.id },
    select: {
      email: true,
      role: true,
      authorizationSignedAt: true,
      consentVersion: true,
      residencyState: true,
      confirmationSource: true,
      forwardingToken: true,
    },
  });
  return NextResponse.json({ account: user });
}

// POST /api/account → capture the electronic authorization (§2.2). Idempotent.
export async function POST(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = signAuthorizationInput.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  try {
    const user = await prisma.user.update({
      where: { id: guard.user.id },
      data: {
        authorizationSignedAt: new Date(),
        consentVersion: parsed.data.consentVersion,
        residencyState: parsed.data.residencyState ?? undefined,
        // Provision a unique inbound forwarding token (confirm+<token>@domain).
        forwardingToken: randomBytes(12).toString("hex"),
      },
      select: { authorizationSignedAt: true, forwardingToken: true },
    });
    return NextResponse.json({ authorized: true, ...user }, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}

// PATCH /api/account → update settings (residency, confirmation source).
export async function PATCH(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = updateAccountInput.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const user = await prisma.user.update({
    where: { id: guard.user.id },
    data: {
      residencyState: parsed.data.residencyState ?? undefined,
      confirmationSource: parsed.data.confirmationSource ?? undefined,
    },
    select: { residencyState: true, confirmationSource: true },
  });
  return NextResponse.json({ account: user });
}

/**
 * DELETE /api/account → one-click account deletion (§2.1). Purges the user's
 * fingerprint, listings, evidence, and requests. Cascade FKs from User handle
 * attributes/listings/requests/submissions; evidence cascades from requests.
 */
export async function DELETE() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  try {
    await prisma.user.delete({ where: { id: guard.user.id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}
