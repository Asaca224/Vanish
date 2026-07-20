import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { transition } from "@/lib/state-machine";
import { addDays } from "@/lib/drop";

/**
 * Vercel Cron: re-check `removed` listings on their broker cadence (spec §8).
 * A due recheck re-queues the request as a potential relisting. Actual browser
 * rechecks are performed by the worker (§3.5); here we only detect what is DUE
 * and flip state to queued so the worker (or operator) picks it up.
 *
 * Bounded per invocation.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.removalRequest.findMany({
    where: {
      state: "removed",
      nextRecheckAt: { lte: now },
    },
    include: { broker: { select: { recheckDays: true, name: true } } },
    take: 50,
    orderBy: { nextRecheckAt: "asc" },
  });

  let requeued = 0;
  for (const req of due) {
    // removed → queued (relisting recheck). Schedule the next recheck window.
    await transition(prisma, req, "queued", {
      note: "Recheck due — re-queued to detect relisting",
    });
    await prisma.removalRequest.update({
      where: { id: req.id },
      data: { nextRecheckAt: addDays(now, req.broker.recheckDays) },
    });
    requeued++;
  }

  return NextResponse.json({ due: due.length, requeued });
}
