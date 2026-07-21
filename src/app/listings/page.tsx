import { prisma } from "@/lib/prisma";
import { requireOnboarded } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function ListingsPage() {
  const session = await requireOnboarded();
  const listings = await prisma.listing.findMany({
    where: { userId: session.user.id },
    orderBy: { discoveredAt: "desc" },
    include: { broker: { select: { name: true, domain: true } } },
    take: 500,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Found listings</h1>
        <p className="mt-1 text-sm text-muted">
          Where your fingerprint appears. Ambiguous matches await your review —
          we never act on a match you haven&apos;t confirmed (§2.3).
        </p>
      </div>

      {listings.length === 0 ? (
        <div className="card text-sm text-muted">
          No listings yet. Automated discovery scanning arrives with the browser
          worker (Phase 3); until then, DROP + email channels still run from the
          registry.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2">Broker</th>
                <th className="pb-2">Confidence</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Found</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-t border-edge">
                  <td className="py-2">
                    <div className="font-medium">{l.broker.name}</div>
                    <div className="text-xs text-muted">{l.broker.domain}</div>
                  </td>
                  <td className="py-2 text-muted">
                    {Math.round(l.matchConfidence * 100)}%
                  </td>
                  <td className="py-2 text-muted">{l.status}</td>
                  <td className="py-2 text-muted">
                    {l.discoveredAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
