import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOperator, serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

// DELETE /api/identity/:id → remove one fingerprint attribute (data minimization).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    await prisma.identityAttribute.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}
