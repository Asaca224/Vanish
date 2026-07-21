import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, serverError } from "@/lib/api";
import { runDiscovery } from "@/lib/discovery";
import { aiEnabled } from "@/lib/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin/discovery → run history + proposal count.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const [runs, proposalCount] = await Promise.all([
    prisma.discoveryRun.findMany({ orderBy: { startedAt: "desc" }, take: 25 }),
    prisma.broker.count({ where: { status: "proposed" } }),
  ]);
  return NextResponse.json({ runs, proposalCount, aiEnabled: aiEnabled() });
}

// POST /api/admin/discovery → the "Search for new aggregators" button (§8).
export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const result = await runDiscovery(prisma, "admin");
    return NextResponse.json({ result });
  } catch (err) {
    return serverError(err);
  }
}
