import { prisma } from "@/lib/prisma";
import { findConfirmationEmails } from "@/lib/gmail";
import { transition } from "@/lib/state-machine";
import { addDays, daysUntil } from "@/lib/drop";

/**
 * The scheduled maintenance routines (spec §8), extracted so they can run
 * either individually (their own /api/cron/* endpoints, for manual triggering)
 * or together from the single daily orchestrator /api/cron/tick.
 *
 * Vercel's Hobby plan caps the number of cron jobs, so production schedules ONE
 * tick that runs all three; each routine still does a bounded chunk of work.
 */

// Poll Gmail for broker confirmation emails; advance awaiting_confirmation →
// confirmed. Pure API call — Vercel-safe.
export async function pollGmailConfirmations(): Promise<{
  scanned: number;
  confirmed: number;
  errors: string[];
}> {
  const pending = await prisma.removalRequest.findMany({
    where: { state: "awaiting_confirmation" },
    include: { broker: { select: { name: true, confirmationEmailFrom: true } } },
    take: 25,
    orderBy: { submittedAt: "asc" },
  });

  let confirmed = 0;
  const errors: string[] = [];

  for (const req of pending) {
    const pattern = req.broker.confirmationEmailFrom;
    if (!pattern) continue;
    try {
      const hits = await findConfirmationEmails({
        fromPattern: pattern,
        sinceDaysAgo: 30,
        max: 5,
      });
      if (hits.length > 0) {
        await transition(prisma, req, "confirmed", {
          note: `Confirmation email matched from ${hits[0].from}`,
        });
        await prisma.evidence.create({
          data: {
            removalRequestId: req.id,
            kind: "email_ref",
            blobRef: `gmail:${hits[0].messageId}`,
          },
        });
        confirmed++;
      }
    } catch (err) {
      errors.push(
        `${req.broker.name}: ${err instanceof Error ? err.message : "error"}`,
      );
    }
  }

  return { scanned: pending.length, confirmed, errors };
}

// Re-check `removed` listings on their broker cadence; a due recheck re-queues
// the request to detect a relisting. Actual browser rechecks run in the worker.
export async function recheckRemovedListings(): Promise<{
  due: number;
  requeued: number;
}> {
  const now = new Date();
  const due = await prisma.removalRequest.findMany({
    where: { state: "removed", nextRecheckAt: { lte: now } },
    include: { broker: { select: { recheckDays: true } } },
    take: 50,
    orderBy: { nextRecheckAt: "asc" },
  });

  let requeued = 0;
  for (const req of due) {
    await transition(prisma, req, "queued", {
      note: "Recheck due — re-queued to detect relisting",
    });
    await prisma.removalRequest.update({
      where: { id: req.id },
      data: { nextRecheckAt: addDays(now, req.broker.recheckDays) },
    });
    requeued++;
  }

  return { due: due.length, requeued };
}

// Track DROP's 45-day retrieve / 90-day finalize windows and flag overdue
// submissions so the operator can escalate or re-route via a faster channel.
export async function trackDropWindows(): Promise<{
  submissions: Array<{
    submissionId: string;
    submittedAt: Date;
    coveredCount: number;
    retrieveDaysRemaining: number | null;
    finalizeDaysRemaining: number | null;
    retrieveOverdue: boolean;
    finalizeOverdue: boolean;
  }>;
  overdueCount: number;
}> {
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

  const overdueCount = report.filter(
    (r) => r.finalizeOverdue || r.retrieveOverdue,
  ).length;
  return { submissions: report, overdueCount };
}
