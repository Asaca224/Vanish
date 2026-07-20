import { prisma } from "@/lib/prisma";
import { DropFlow } from "@/components/DropFlow";
import { daysUntil } from "@/lib/drop";

export const dynamic = "force-dynamic";

export default async function DropPage() {
  const [subject, coveredCount, submissions] = await Promise.all([
    prisma.subject.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.broker.count({
      where: { caRegistered: true, removalMethod: { not: "manual_only" } },
    }),
    prisma.channelSubmission.findMany({
      where: { channel: "drop" },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">California DROP</h1>
        <p className="mt-1 text-sm text-muted">
          Delete Request and Opt-out Platform — the single highest-leverage
          channel for California residents. Assisted, not automated.
        </p>
      </div>

      <DropFlow subjectId={subject?.id ?? null} coveredCount={coveredCount} />

      {submissions.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Recorded submissions
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2">Submitted</th>
                <th className="pb-2">Covers</th>
                <th className="pb-2">Reference</th>
                <th className="pb-2">Retrieve (45d)</th>
                <th className="pb-2">Finalize (90d)</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => {
                const retrieve = s.retrieveByAt ? daysUntil(s.retrieveByAt) : null;
                const finalize = s.finalizeByAt ? daysUntil(s.finalizeByAt) : null;
                return (
                  <tr key={s.id} className="border-t border-edge">
                    <td className="py-2">
                      {s.submittedAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="py-2">
                      {Array.isArray(s.coversBrokerIds)
                        ? s.coversBrokerIds.length
                        : 0}
                    </td>
                    <td className="py-2 text-muted">
                      {s.requestReference ?? "—"}
                    </td>
                    <td
                      className={`py-2 ${retrieve !== null && retrieve < 0 ? "text-bad" : ""}`}
                    >
                      {retrieve !== null ? `${retrieve}d` : "—"}
                    </td>
                    <td
                      className={`py-2 ${finalize !== null && finalize < 0 ? "text-bad" : ""}`}
                    >
                      {finalize !== null ? `${finalize}d` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
