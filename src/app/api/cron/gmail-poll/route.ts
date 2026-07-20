import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { findConfirmationEmails } from "@/lib/gmail";
import { transition } from "@/lib/state-machine";

/**
 * Vercel Cron: poll Gmail for broker confirmation emails and advance
 * awaiting_confirmation → confirmed (spec §8). Pure API call — Vercel-safe.
 *
 * Bounded per invocation: processes a chunk of awaiting_confirmation requests.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({ scanned: pending.length, confirmed, errors });
}
