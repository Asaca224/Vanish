import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { reviewProposalInput } from "@/lib/validation";
import { isCoveredByDrop } from "@/lib/channel-router";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/discovery/review — approve or reject a proposed broker (§8.6).
 * Approve optionally applies edits first, then flips status → live. Reject flips
 * status → rejected and marks the candidate rejected so it isn't re-proposed.
 * Only admin-approved brokers ever enter user-facing scanning/removal (§2.3).
 */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = reviewProposalInput.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const broker = await prisma.broker.findUnique({
    where: { id: parsed.data.brokerId },
  });
  if (!broker) return badRequest("Broker not found");
  if (broker.status !== "proposed") {
    return badRequest(`Broker is not a proposal (status: ${broker.status}).`);
  }

  try {
    if (parsed.data.action === "reject") {
      await prisma.$transaction([
        prisma.broker.update({
          where: { id: broker.id },
          data: { status: "rejected" },
        }),
        prisma.discoveryCandidate.updateMany({
          where: { domain: broker.domain },
          data: { disposition: "rejected" },
        }),
      ]);
      return NextResponse.json({ status: "rejected" });
    }

    // approve (+ optional edits) → live
    const edits = parsed.data.edits ?? {};
    const data: Record<string, unknown> = { ...edits, status: "live" };
    if (edits.caRegistered !== undefined || edits.removalMethod !== undefined) {
      data.coveredByDrop = isCoveredByDrop({
        caRegistered: edits.caRegistered ?? broker.caRegistered,
        removalMethod: edits.removalMethod ?? broker.removalMethod,
      });
    }
    if (edits.optOutUrl === "") data.optOutUrl = null;
    if (edits.optOutEmail === "") data.optOutEmail = null;

    const updated = await prisma.broker.update({
      where: { id: broker.id },
      data,
    });
    return NextResponse.json({ status: "live", broker: updated });
  } catch (err) {
    return serverError(err);
  }
}
