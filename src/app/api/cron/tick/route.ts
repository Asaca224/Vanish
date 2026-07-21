import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import {
  notifyActionNeeded,
  pollGmailConfirmations,
  recheckRemovedListings,
  trackDropWindows,
} from "@/lib/cron-jobs";
import { runDiscovery } from "@/lib/discovery";

/**
 * The single daily maintenance cron (spec §8). Vercel's Hobby plan caps the
 * number of cron jobs, so all scheduled work runs from ONE tick rather than a
 * cron per routine. Each routine does a bounded chunk and fails soft — one
 * routine erroring doesn't stop the others.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await Promise.allSettled([
    pollGmailConfirmations(),
    recheckRemovedListings(),
    trackDropWindows(),
    runDiscovery(prisma, "cron"), // §8 daily discovery
    notifyActionNeeded(), // §6 action-needed digests
  ]);

  const [gmail, recheck, drop, discovery, notify] = results;
  const val = (r: PromiseSettledResult<unknown>) =>
    r.status === "fulfilled" ? r.value : { error: String(r.reason) };
  return NextResponse.json({
    ranAt: new Date().toISOString(),
    gmailPoll: val(gmail),
    recheck: val(recheck),
    dropWindows: val(drop),
    discovery: val(discovery),
    notify: val(notify),
  });
}
