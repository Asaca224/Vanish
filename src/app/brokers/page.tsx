import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOnboarded } from "@/lib/page-auth";
import { RemovalLauncher } from "@/components/RemovalLauncher";
import { resendConfigured } from "@/lib/resend";

export const dynamic = "force-dynamic";

export default async function BrokersPage() {
  await requireOnboarded();

  const live = await prisma.broker.findMany({
    where: { status: "live" },
    orderBy: { name: "asc" },
  });

  const emailBrokers = live
    .filter((b) => b.removalMethod === "email" && b.optOutEmail)
    .map((b) => ({
      id: b.id,
      name: b.name,
      domain: b.domain,
      removalMethod: b.removalMethod,
      optOutEmail: b.optOutEmail,
    }));

  const others = live.filter((b) => b.removalMethod !== "email");
  const resendReady = resendConfigured();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Send removals</h1>
        <p className="mt-1 text-sm text-muted">
          Email-channel opt-outs go out from Vanish via Resend, using the minimum
          fields a broker needs. Review each draft before it sends.
        </p>
      </div>

      {!resendReady && (
        <div className="card border-warn/40 bg-warn/5 text-sm">
          Resend isn&apos;t configured yet — set <code>RESEND_API_KEY</code> and a
          verified <code>RESEND_FROM</code> domain, then redeploy. Drafts will
          preview but sending will fail until then.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Email opt-outs ({emailBrokers.length})
        </h2>
        <RemovalLauncher brokers={emailBrokers} />
      </section>

      {others.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Other channels
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2">Broker</th>
                  <th className="pb-2">Channel</th>
                  <th className="pb-2">How</th>
                </tr>
              </thead>
              <tbody>
                {others.map((b) => (
                  <tr key={b.id} className="border-t border-edge">
                    <td className="py-2">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-muted">{b.domain}</div>
                    </td>
                    <td className="py-2 text-muted">{b.removalMethod}</td>
                    <td className="py-2 text-xs text-muted">
                      {b.removalMethod === "drop" && (
                        <Link href="/drop" className="text-accent hover:underline">
                          Handled by DROP →
                        </Link>
                      )}
                      {b.removalMethod === "web_form" && "Web form — needs the browser worker (Phase 3)"}
                      {b.removalMethod === "postal" && "Postal — generate a letter to mail"}
                      {b.removalMethod === "manual_only" && "Manual only"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
