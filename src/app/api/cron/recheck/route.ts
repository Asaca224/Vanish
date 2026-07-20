import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { recheckRemovedListings } from "@/lib/cron-jobs";

/**
 * Manual/individual endpoint for the relisting recheck (spec §8). In production
 * the daily /api/cron/tick runs this; kept here for manual runs.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await recheckRemovedListings());
}
