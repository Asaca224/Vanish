import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/report[?format=csv] — the user's exportable removal report (spec
 * Phase 4). JSON by default; CSV of requests when format=csv. Scoped by userId;
 * no PII values, only broker + lifecycle metadata.
 */
export async function GET(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const userId = guard.user.id;
  const format = new URL(request.url).searchParams.get("format");

  const requests = await prisma.removalRequest.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { broker: { select: { name: true, domain: true } } },
  });

  if (format === "csv") {
    const header = [
      "broker",
      "domain",
      "channel",
      "state",
      "submitted_at",
      "confirmed_at",
      "verified_removed_at",
      "reason",
    ];
    const rows = requests.map((r) =>
      [
        r.broker.name,
        r.broker.domain,
        r.channel,
        r.state,
        r.submittedAt?.toISOString() ?? "",
        r.confirmedAt?.toISOString() ?? "",
        r.verifiedRemovedAt?.toISOString() ?? "",
        r.exemptReason ?? r.failureReason ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="vanish-report.csv"`,
      },
    });
  }

  const byState = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.state] = (acc[r.state] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    total: requests.length,
    byState,
    requests: requests.map((r) => ({
      broker: r.broker.name,
      channel: r.channel,
      state: r.state,
      submittedAt: r.submittedAt,
      verifiedRemovedAt: r.verifiedRemovedAt,
    })),
  });
}
