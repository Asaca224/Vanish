import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/page-auth";
import { aiEnabled } from "@/lib/anthropic";
import { Stat } from "@/components/ui";
import { DiscoveryConsole } from "@/components/admin/DiscoveryConsole";
import { ProposalQueue } from "@/components/admin/ProposalQueue";

export const dynamic = "force-dynamic";

type EvidenceQuote = { url: string; snippet: string };

export default async function AdminPage() {
  await requireAdminSession();

  const [proposalsRaw, runs, byStatus, userCount, reqByState, jobsByState] =
    await Promise.all([
      prisma.broker.findMany({
        where: { status: "proposed" },
        orderBy: { discoveryConfidence: "desc" },
        take: 100,
      }),
      prisma.discoveryRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
      prisma.broker.groupBy({ by: ["status"], _count: true }),
      prisma.user.count(),
      // Ops view (§3): metadata only, across users — no PII values.
      prisma.removalRequest.groupBy({ by: ["state"], _count: true }),
      prisma.workerJob.groupBy({ by: ["state"], _count: true }),
    ]);

  const reqCounts = Object.fromEntries(reqByState.map((r) => [r.state, r._count]));
  const jobCounts = Object.fromEntries(jobsByState.map((j) => [j.state, j._count]));

  const statusCounts = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));

  const proposals = proposalsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    domain: p.domain,
    optOutUrl: p.optOutUrl,
    removalMethod: p.removalMethod,
    optOutEmail: p.optOutEmail,
    requiresCaptcha: p.requiresCaptcha,
    requiresId: p.requiresId,
    discoveryConfidence: p.discoveryConfidence,
    notes: p.notes,
    evidence: Array.isArray(p.evidence) ? (p.evidence as EvidenceQuote[]) : [],
  }));

  const runsForClient = runs.map((r) => ({
    id: r.id,
    trigger: r.trigger,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    stats: (r.stats as Record<string, unknown> | null) ?? null,
    error: r.error,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <Link href="/admin/brokers" className="btn-ghost">
          Manage registry →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Users" value={userCount} />
        <Stat label="Live" value={statusCounts.live ?? 0} />
        <Stat label="Proposed" value={statusCounts.proposed ?? 0} hint="review below" />
        <Stat label="Rejected" value={statusCounts.rejected ?? 0} />
        <Stat label="Retired" value={statusCounts.retired ?? 0} />
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Ops (all users · metadata only)
        </h2>
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-muted">Requests failed</div>
            <div className="text-lg font-semibold">{reqCounts.failed ?? 0}</div>
          </div>
          <div>
            <div className="text-muted">Requests blocked</div>
            <div className="text-lg font-semibold">{reqCounts.blocked ?? 0}</div>
          </div>
          <div>
            <div className="text-muted">Awaiting user</div>
            <div className="text-lg font-semibold">{reqCounts.awaiting_user ?? 0}</div>
          </div>
          <div>
            <div className="text-muted">Worker jobs queued</div>
            <div className="text-lg font-semibold">{jobCounts.queued ?? 0}</div>
          </div>
          <div>
            <div className="text-muted">Worker jobs failed</div>
            <div className="text-lg font-semibold">{jobCounts.failed ?? 0}</div>
          </div>
        </div>
      </div>

      <DiscoveryConsole runs={runsForClient} aiEnabled={aiEnabled()} />

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Proposal review queue ({proposals.length})
        </h2>
        <ProposalQueue proposals={proposals} />
      </div>
    </div>
  );
}
