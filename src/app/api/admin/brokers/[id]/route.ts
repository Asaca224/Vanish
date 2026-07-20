import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { upsertBrokerInput } from "@/lib/validation";
import { isCoveredByDrop } from "@/lib/channel-router";

export const dynamic = "force-dynamic";

// PATCH /api/admin/brokers/:id → edit a broker (any field, incl. status).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = upsertBrokerInput.partial().safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const data: Record<string, unknown> = { ...parsed.data };
  // Recompute coveredByDrop if either input changed.
  if (parsed.data.caRegistered !== undefined || parsed.data.removalMethod !== undefined) {
    const current = await prisma.broker.findUnique({ where: { id } });
    if (!current) return badRequest("Broker not found");
    data.coveredByDrop = isCoveredByDrop({
      caRegistered: parsed.data.caRegistered ?? current.caRegistered,
      removalMethod: parsed.data.removalMethod ?? current.removalMethod,
    });
  }
  if (parsed.data.optOutUrl === "") data.optOutUrl = null;
  if (parsed.data.optOutEmail === "") data.optOutEmail = null;

  try {
    const broker = await prisma.broker.update({ where: { id }, data });
    return NextResponse.json({ broker });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/admin/brokers/:id → remove a broker from the registry.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  try {
    await prisma.broker.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}
