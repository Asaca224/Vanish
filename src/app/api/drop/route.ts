import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireOperator, serverError } from "@/lib/api";
import { recordDropSubmissionInput } from "@/lib/validation";
import { dropWindows } from "@/lib/drop";

export const dynamic = "force-dynamic";

/**
 * POST /api/drop — record the operator's DROP submission (spec §3, Phase 1).
 *
 * DROP is ASSISTED: the operator submits on the authenticated privacy.ca.gov
 * site themselves. This endpoint records ONE ChannelSubmission covering every
 * CA-registered broker, creates DROP-channel RemovalRequests for those brokers
 * (state skipped_covered_by_drop → they're handled by the bulk submission),
 * and starts tracking the 45/90-day windows.
 *
 * GET returns a preview: which brokers a DROP submission would cover.
 */

export async function GET() {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  const covered = await prisma.broker.findMany({
    where: { caRegistered: true, removalMethod: { not: "manual_only" } },
    select: { id: true, name: true, domain: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ coveredCount: covered.length, brokers: covered });
}

export async function POST(request: Request) {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = recordDropSubmissionInput.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const subject = await prisma.subject.findUnique({
    where: { id: parsed.data.subjectId },
  });
  if (!subject) return badRequest("Subject not found");

  const covered = await prisma.broker.findMany({
    where: { caRegistered: true, removalMethod: { not: "manual_only" } },
    select: { id: true },
  });
  if (covered.length === 0) {
    return badRequest(
      "No CA-registered brokers in the registry. Import the CA registry first.",
    );
  }

  const submittedAt = new Date();
  const { retrieveByAt, finalizeByAt } = dropWindows(submittedAt);
  const brokerIds = covered.map((b) => b.id);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.channelSubmission.create({
        data: {
          subjectId: subject.id,
          channel: "drop",
          submittedAt,
          requestReference: parsed.data.requestReference ?? null,
          coversBrokerIds: brokerIds,
          retrieveByAt,
          finalizeByAt,
        },
      });

      // Create a DROP-channel request per covered broker, marked as covered by
      // the bulk submission so we don't redundantly hit their per-broker forms.
      for (const brokerId of brokerIds) {
        const req = await tx.removalRequest.create({
          data: {
            subjectId: subject.id,
            brokerId,
            channel: "drop",
            state: "skipped_covered_by_drop",
            channelSubmissionId: submission.id,
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

      return submission;
    });

    return NextResponse.json(
      {
        submission: result,
        coveredCount: brokerIds.length,
        retrieveByAt,
        finalizeByAt,
      },
      { status: 201 },
    );
  } catch (err) {
    return serverError(err);
  }
}
