import type { RequestState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOnboarded } from "@/lib/page-auth";
import { StateBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const session = await requireOnboarded();
  const userId = session.user.id;

  const [requests, grouped] = await Promise.all([
    prisma.removalRequest.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 500,
      include: { broker: { select: { name: true, domain: true } } },
    }),
    prisma.removalRequest.groupBy({ by: ["state"], where: { userId }, _count: true }),
  ]);

  const counts = Object.fromEntries(grouped.map((g) => [g.state, g._count])) as Record<
    RequestState,
    number
  >;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Removal requests</h1>
        <p className="mt-1 text-sm text-muted">
          The lifecycle of every request across all channels.
        </p>
      </div>

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

      <div className="card overflow-x-auto">
        {requests.length === 0 ? (
          <p className="text-sm text-muted">
            No requests yet. Start a DROP submission or create email opt-outs.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2">Broker</th>
                <th className="pb-2">Channel</th>
                <th className="pb-2">State</th>
                <th className="pb-2">Submitted</th>
                <th className="pb-2">Next recheck</th>
                <th className="pb-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-edge">
                  <td className="py-2">
                    <div className="font-medium">{r.broker.name}</div>
                    <div className="text-xs text-muted">{r.broker.domain}</div>
                  </td>
                  <td className="py-2 text-muted">{r.channel}</td>
                  <td className="py-2">
                    <StateBadge state={r.state} />
                  </td>
                  <td className="py-2 text-muted">
                    {r.submittedAt ? r.submittedAt.toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="py-2 text-muted">
                    {r.nextRecheckAt ? r.nextRecheckAt.toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="py-2 text-xs text-muted">
                    {r.exemptReason ?? r.failureReason ?? "—"}
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
