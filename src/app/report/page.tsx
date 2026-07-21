import Link from "next/link";
import type { RequestState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOnboarded } from "@/lib/page-auth";
import { Stat, StateBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const session = await requireOnboarded();
  const userId = session.user.id;

  const [grouped, listings, drop] = await Promise.all([
    prisma.removalRequest.groupBy({ by: ["state"], where: { userId }, _count: true }),
    prisma.listing.count({ where: { userId, status: "confirmed" } }),
    prisma.channelSubmission.count({ where: { userId, channel: "drop" } }),
  ]);

  const counts = Object.fromEntries(grouped.map((g) => [g.state, g._count])) as Record<
    RequestState,
    number
  >;
  const total = grouped.reduce((s, g) => s + g._count, 0);
  const removed = counts.removed ?? 0;
  const exempt = counts.exempt ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Removal report</h1>
          <p className="mt-1 text-sm text-muted">
            An honest summary of your removals. &quot;Verified absent&quot; means
            a listing check came back empty — decent evidence, not proof of
            internal deletion (§12).
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/report?format=csv" className="btn-ghost">
            Export CSV
          </a>
          <a href="/api/report" target="_blank" rel="noreferrer" className="btn-ghost">
            JSON
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total requests" value={total} />
        <Stat label="Removed" value={removed} />
        <Stat label="Confirmed listings" value={listings} />
        <Stat label="Exempt" value={exempt} hint="out of scope" />
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          By state
        </h2>
        {total === 0 ? (
          <p className="text-sm text-muted">
            No requests yet. Confirm listings or start a{" "}
            <Link href="/drop" className="text-accent hover:underline">
              DROP submission
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(counts).map(([state, count]) => (
              <div
                key={state}
                className="flex items-center gap-2 rounded-md border border-edge px-3 py-1.5 text-xs"
              >
                <StateBadge state={state as RequestState} />
                <span className="text-muted">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        {drop > 0
          ? "Includes brokers covered by your DROP submission (45-day retrieve / 90-day finalize windows tracked on the DROP page)."
          : "No DROP submission on file yet."}
      </p>
    </div>
  );
}
