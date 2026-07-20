import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { daysUntil } from "@/lib/drop";

/**
 * Vercel Cron: track DROP's 45-day retrieve / 90-day finalize windows and flag
 * brokers that blow past them (spec §8). Read-only reporting — it surfaces
 * overdue DROP submissions so the operator can escalate or re-route via a
 * faster per-broker channel.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const submissions = await prisma.channelSubmission.findMany({
    where: { channel: "drop" },
    orderBy: { submittedAt: "desc" },
  });

  const report = submissions.map((s) => {
    const retrieveDays = s.retrieveByAt ? daysUntil(s.retrieveByAt, now) : null;
    const finalizeDays = s.finalizeByAt ? daysUntil(s.finalizeByAt, now) : null;
    return {
      submissionId: s.id,
      submittedAt: s.submittedAt,
      coveredCount: Array.isArray(s.coversBrokerIds)
        ? s.coversBrokerIds.length
        : 0,
      retrieveDaysRemaining: retrieveDays,
      finalizeDaysRemaining: finalizeDays,
      retrieveOverdue: retrieveDays !== null && retrieveDays < 0,
      finalizeOverdue: finalizeDays !== null && finalizeDays < 0,
    };
  });

  const overdue = report.filter((r) => r.finalizeOverdue || r.retrieveOverdue);
  return NextResponse.json({ submissions: report, overdueCount: overdue.length });
}
