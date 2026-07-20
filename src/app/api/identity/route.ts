import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, requireOperator, serverError } from "@/lib/api";
import { addAttributesInput } from "@/lib/validation";
import { decryptAttribute, toEncryptedRow } from "@/lib/identity";

export const dynamic = "force-dynamic";

// GET /api/identity?subjectId=... → decrypted attributes for a subject.
export async function GET(request: Request) {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  const subjectId = new URL(request.url).searchParams.get("subjectId");
  if (!subjectId) return badRequest("subjectId query param is required");

  const rows = await prisma.identityAttribute.findMany({
    where: { subjectId },
    orderBy: { createdAt: "asc" },
  });
  // Decrypt server-side; the plaintext leaves only to the authenticated operator.
  return NextResponse.json({ attributes: rows.map(decryptAttribute) });
}

// POST /api/identity → add field-encrypted fingerprint rows.
export async function POST(request: Request) {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = addAttributesInput.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const subject = await prisma.subject.findUnique({
    where: { id: parsed.data.subjectId },
  });
  if (!subject) return badRequest("Subject not found");

  const rows = parsed.data.attributes.map((a) =>
    toEncryptedRow(parsed.data.subjectId, a),
  );

  try {
    // Skip duplicates via the (subjectId, type, valueHash) blind-index unique.
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
