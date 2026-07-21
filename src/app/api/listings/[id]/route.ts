import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, requireUser, serverError } from "@/lib/api";
import { routeChannel } from "@/lib/channel-router";

export const dynamic = "force-dynamic";

const input = z.object({ action: z.enum(["confirm", "reject"]) });

/**
 * PATCH /api/listings/:id — the "this is me / not me" review (§2.3).
 * confirm → status=confirmed and (for actionable brokers) create a routed
 * RemovalRequest linked to the listing. reject → status=rejected, no action.
 * Scoped to the signed-in user.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = input.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const listing = await prisma.listing.findFirst({
    where: { id, userId: guard.user.id },
    include: { broker: true },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (parsed.data.action === "reject") {
      await prisma.listing.update({ where: { id }, data: { status: "rejected" } });
      return NextResponse.json({ status: "rejected" });
    }

    // confirm → mark confirmed and open a removal request if one doesn't exist.
    await prisma.listing.update({ where: { id }, data: { status: "confirmed" } });

    const channel = routeChannel(listing.broker);
    let requestId: string | null = null;
    if (channel !== "manual_only") {
      const existing = await prisma.removalRequest.findFirst({
        where: { userId: guard.user.id, brokerId: listing.brokerId, listingId: listing.id },
      });
      if (!existing) {
        const created = await prisma.removalRequest.create({
          data: {
            userId: guard.user.id,
            brokerId: listing.brokerId,
            listingId: listing.id,
            channel,
            state: "discovered",
            confirmationRequired: Boolean(listing.broker.confirmationEmailFrom),
          },
        });
        await prisma.requestEvent.create({
          data: {
            removalRequestId: created.id,
            toState: "discovered",
            note: `Confirmed listing → ${channel} channel`,
          },
        });
        requestId = created.id;
      }
    }
    return NextResponse.json({ status: "confirmed", requestId });
  } catch (err) {
    return serverError(err);
  }
}
