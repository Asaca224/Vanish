import Link from "next/link";
import type { RequestState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOnboarded } from "@/lib/page-auth";
import { Stat, StateBadge } from "@/components/ui";
import { daysUntil } from "@/lib/drop";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await requireOnboarded();
  const userId = session.user.id;

  const [attrCount, liveBrokers, grouped, dropSubs, recent] = await Promise.all([
    prisma.identityAttribute.count({ where: { userId } }),
    prisma.broker.count({ where: { status: "live" } }),
    prisma.removalRequest.groupBy({ by: ["state"], where: { userId }, _count: true }),
    prisma.channelSubmission.findMany({
      where: { userId, channel: "drop" },
      orderBy: { submittedAt: "desc" },
      take: 1,
    }),
    prisma.removalRequest.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: { broker: { select: { name: true } } },
    }),
  ]);

  const byState = Object.fromEntries(grouped.map((g) => [g.state, g._count])) as Record<
    RequestState,
    number
  >;
  const total = grouped.reduce((s, g) => s + g._count, 0);
  const removed = byState.removed ?? 0;
  const actionNeeded =
    (byState.awaiting_user ?? 0) +
    (byState.awaiting_user_verification ?? 0) +
    (byState.blocked ?? 0);
  const inFlight = total - removed - (byState.exempt ?? 0) - (byState.failed ?? 0);
  const latestDrop = dropSubs[0];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/onboarding" className="btn-ghost">
            Identity
          </Link>
          <Link href="/drop" className="btn">
            Start DROP
          </Link>
        </div>
      </div>

      {attrCount === 0 && (
        <div className="card border-warn/40 bg-warn/5 text-sm">
          Your fingerprint is empty.{" "}
          <Link href="/onboarding" className="text-accent underline">
            Add your identity details
          </Link>{" "}
          so we can find your listings.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Fingerprint" value={attrCount} hint="attributes" />
        <Stat label="Live brokers" value={liveBrokers} />
        <Stat label="In flight" value={inFlight < 0 ? 0 : inFlight} />
        <Stat
          label="Action needed"
          value={actionNeeded}
          hint={actionNeeded > 0 ? "review below" : undefined}
        />
      </div>

      {latestDrop && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            DROP submission
          </h2>
          <div className="flex flex-wrap gap-8 text-sm">
            <div>
              <div className="text-muted">Submitted</div>
              <div>{latestDrop.submittedAt.toISOString().slice(0, 10)}</div>
            </div>
            <div>
              <div className="text-muted">Retrieve (45d)</div>
              <div>{latestDrop.retrieveByAt ? `${daysUntil(latestDrop.retrieveByAt)}d left` : "—"}</div>
            </div>
            <div>
              <div className="text-muted">Finalize (90d)</div>
              <div>{latestDrop.finalizeByAt ? `${daysUntil(latestDrop.finalizeByAt)}d left` : "—"}</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Recent activity
          </h2>
          <Link href="/requests" className="text-sm text-accent hover:underline">
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">No removal requests yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-edge">
                  <td className="py-2">{r.broker.name}</td>
                  <td className="py-2 text-muted">{r.channel}</td>
                  <td className="py-2">
                    <StateBadge state={r.state} />
                  </td>
                  <td className="py-2 text-right text-muted">
                    {r.updatedAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
