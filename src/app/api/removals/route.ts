import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireUser, serverError } from "@/lib/api";
import { createRemovalRequestInput } from "@/lib/validation";
import { routeChannel } from "@/lib/channel-router";

export const dynamic = "force-dynamic";

// GET /api/removals?state= → this user's lifecycle records.
export async function GET(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const state = new URL(request.url).searchParams.get("state") ?? undefined;

  const requests = await prisma.removalRequest.findMany({
    where: {
      userId: guard.user.id,
      ...(state ? { state: state as never } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      broker: { select: { name: true, domain: true, removalMethod: true } },
    },
    take: 500,
  });
  return NextResponse.json({ requests });
}

// POST /api/removals → create a removal request for this user.
export async function POST(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  // §2.2: a user must have signed the authorization before any request runs.
  const user = await prisma.user.findUnique({ where: { id: guard.user.id } });
  if (!user?.authorizationSignedAt) {
    return badRequest("Authorization not signed — complete signup consent first.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = createRemovalRequestInput.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const broker = await prisma.broker.findUnique({
    where: { id: parsed.data.brokerId },
  });
  if (!broker) return badRequest("Broker not found");
  // Only admin-approved, live brokers are user-actionable (§2.3, §8).
  if (broker.status !== "live") {
    return badRequest(`Broker "${broker.name}" is not live (status: ${broker.status}).`);
  }

  const channel = routeChannel(broker);
  if (channel === "manual_only") {
    return badRequest(`Broker "${broker.name}" is manual_only — no automated channel.`);
  }

  try {
    const created = await prisma.removalRequest.create({
      data: {
        userId: guard.user.id,
        brokerId: broker.id,
        listingId: parsed.data.listingId ?? null,
        channel,
        state: "discovered",
        confirmationRequired: Boolean(broker.confirmationEmailFrom),
      },
    });
    await prisma.requestEvent.create({
      data: {
        removalRequestId: created.id,
        toState: "discovered",
        note: `Created via ${channel} channel`,
      },
    });
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}
