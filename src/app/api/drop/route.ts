import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireUser, serverError } from "@/lib/api";
import { recordDropSubmissionInput } from "@/lib/validation";
import { dropWindows } from "@/lib/drop";

export const dynamic = "force-dynamic";

/**
 * DROP-assist (spec §5, Phase 1). Assisted: the user submits on the
 * authenticated privacy.ca.gov site; this records one ChannelSubmission over
 * every live CA-registered broker and tracks the 45/90-day windows. Scoped to
 * the signed-in user.
 */

function coveredBrokersWhere() {
  return {
    caRegistered: true,
    status: "live" as const,
    removalMethod: { not: "manual_only" as const },
  };
}

export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const covered = await prisma.broker.findMany({
    where: coveredBrokersWhere(),
    select: { id: true, name: true, domain: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ coveredCount: covered.length, brokers: covered });
}

export async function POST(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

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
  const parsed = recordDropSubmissionInput.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const covered = await prisma.broker.findMany({
    where: coveredBrokersWhere(),
    select: { id: true },
  });
  if (covered.length === 0) {
    return badRequest("No live CA-registered brokers in the registry yet.");
  }

  const submittedAt = new Date();
  const { retrieveByAt, finalizeByAt } = dropWindows(submittedAt);
  const brokerIds = covered.map((b) => b.id);

  try {
    const submission = await prisma.$transaction(async (tx) => {
      const s = await tx.channelSubmission.create({
        data: {
          userId: guard.user.id,
          channel: "drop",
          submittedAt,
          requestReference: parsed.data.requestReference ?? null,
          coversBrokerIds: brokerIds,
          retrieveByAt,
          finalizeByAt,
        },
      });
      for (const brokerId of brokerIds) {
        const req = await tx.removalRequest.create({
          data: {
            userId: guard.user.id,
            brokerId,
            channel: "drop",
            state: "skipped_covered_by_drop",
            channelSubmissionId: s.id,
            submittedAt,
            nextRecheckAt: finalizeByAt,
          },
        });
        await tx.requestEvent.create({
          data: {
            removalRequestId: req.id,
            toState: "skipped_covered_by_drop",
            note: "Covered by DROP bulk submission",
          },
        });
      }
      return s;
    });

    return NextResponse.json(
      { submission, coveredCount: brokerIds.length, retrieveByAt, finalizeByAt },
      { status: 201 },
    );
  } catch (err) {
    return serverError(err);
  }
}
