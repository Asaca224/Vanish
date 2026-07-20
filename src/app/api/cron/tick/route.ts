import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  pollGmailConfirmations,
  recheckRemovedListings,
  trackDropWindows,
} from "@/lib/cron-jobs";

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
  ]);

  const [gmail, recheck, drop] = results;
  return NextResponse.json({
    ranAt: new Date().toISOString(),
    gmailPoll:
      gmail.status === "fulfilled"
        ? gmail.value
        : { error: String(gmail.reason) },
    recheck:
      recheck.status === "fulfilled"
        ? recheck.value
        : { error: String(recheck.reason) },
    dropWindows:
      drop.status === "fulfilled" ? drop.value : { error: String(drop.reason) },
  });
}
