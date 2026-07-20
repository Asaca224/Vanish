import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireOperator, serverError } from "@/lib/api";
import { createRemovalRequestInput } from "@/lib/validation";
import { routeChannel } from "@/lib/channel-router";

// GET /api/removals?subjectId=&state= → lifecycle records.
export async function GET(request: Request) {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  const subjectId = params.get("subjectId") ?? undefined;
  const state = params.get("state") ?? undefined;

  const requests = await prisma.removalRequest.findMany({
    where: {
      ...(subjectId ? { subjectId } : {}),
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

// POST /api/removals → create a removal request, routing to the right channel.
export async function POST(request: Request) {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = createRemovalRequestInput.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const [subject, broker] = await Promise.all([
    prisma.subject.findUnique({ where: { id: parsed.data.subjectId } }),
    prisma.broker.findUnique({ where: { id: parsed.data.brokerId } }),
  ]);
  if (!subject) return badRequest("Subject not found");
  if (!broker) return badRequest("Broker not found");

  // §9: never submit for a non-operator subject without authorization on file.
  if (!subject.isOperator && !subject.authorizedAgentDocRef) {
    return badRequest(
      "Cannot create requests for a non-operator subject without authorizedAgentDocRef (§9).",
    );
  }

  const channel = routeChannel(broker);
  if (channel === "manual_only") {
    return badRequest(
      `Broker "${broker.name}" is manual_only — no automated channel. Handle by hand.`,
    );
  }

  try {
    const created = await prisma.removalRequest.create({
      data: {
        subjectId: subject.id,
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
