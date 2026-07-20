import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, serverError } from "@/lib/api";

// DELETE /api/identity/:id → remove one of the user's own attributes.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    // Scope the delete by userId so a user can only delete their own rows.
    const result = await prisma.identityAttribute.deleteMany({
      where: { id, userId: guard.user.id },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}
