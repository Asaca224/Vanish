import { prisma } from "@/lib/prisma";
import { Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  drop: "DROP",
  email: "Email",
  web_form: "Web form",
  postal: "Postal",
  manual_only: "Manual only",
};

export default async function BrokersPage() {
  const [total, byMethod, brokers] = await Promise.all([
    prisma.broker.count(),
    prisma.broker.groupBy({ by: ["removalMethod"], _count: true }),
    prisma.broker.findMany({ orderBy: { name: "asc" }, take: 500 }),
  ]);

  const methodCounts = Object.fromEntries(
    byMethod.map((m) => [m.removalMethod, m._count]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Broker registry</h1>
          <p className="mt-1 text-sm text-muted">
            Seeded from the CA data broker registry + a curated people-search
            list. Run <code className="text-gray-300">npm run brokers:import</code>{" "}
            to (re)load.
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="card border-warn/40 bg-warn/5 text-sm">
          Registry is empty. Import it with{" "}
          <code className="text-gray-300">npm run brokers:import</code> (see the
          README for the CA registry CSV source).
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Stat label="Total" value={total} />
            {["drop", "email", "web_form", "postal"].map((m) => (
              <Stat key={m} label={METHOD_LABEL[m]} value={methodCounts[m] ?? 0} />
            ))}
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2">Broker</th>
                  <th className="pb-2">Method</th>
                  <th className="pb-2">CA</th>
                  <th className="pb-2">DROP</th>
                  <th className="pb-2">CAPTCHA</th>
                  <th className="pb-2">ID</th>
                  <th className="pb-2">Recheck</th>
                </tr>
              </thead>
              <tbody>
                {brokers.map((b) => (
                  <tr key={b.id} className="border-t border-edge">
                    <td className="py-2">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-muted">{b.domain}</div>
                    </td>
                    <td className="py-2">{METHOD_LABEL[b.removalMethod]}</td>
                    <td className="py-2">{b.caRegistered ? "✓" : "—"}</td>
                    <td className="py-2">{b.coveredByDrop ? "✓" : "—"}</td>
                    <td className="py-2">{b.requiresCaptcha ? "✓" : "—"}</td>
                    <td className="py-2">{b.requiresId ? "✓" : "—"}</td>
                    <td className="py-2 text-muted">{b.recheckDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
