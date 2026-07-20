import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, requireUser, serverError } from "@/lib/api";
import { addAttributesInput } from "@/lib/validation";
import { decryptAttribute, toEncryptedRow } from "@/lib/identity";

export const dynamic = "force-dynamic";

// GET /api/identity → the signed-in user's decrypted fingerprint.
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const rows = await prisma.identityAttribute.findMany({
    where: { userId: guard.user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ attributes: rows.map(decryptAttribute) });
}

// POST /api/identity → add field-encrypted fingerprint rows for this user.
export async function POST(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = addAttributesInput.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const rows = parsed.data.attributes.map((a) =>
    toEncryptedRow(guard.user.id, a),
  );

  try {
    const result = await prisma.identityAttribute.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return NextResponse.json({ added: result.count }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return badRequest(`Database error: ${err.code}`);
    }
    return serverError(err);
  }
}
