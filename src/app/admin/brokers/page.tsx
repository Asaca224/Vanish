import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/page-auth";
import { BrokerTable } from "@/components/admin/BrokerTable";

export const dynamic = "force-dynamic";

export default async function AdminBrokersPage() {
  await requireAdminSession();
  const brokers = await prisma.broker.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 1000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Broker registry</h1>
          <p className="mt-1 text-sm text-muted">
            {brokers.length} brokers. Only <strong>live</strong> brokers are
            user-actionable.
          </p>
        </div>
        <Link href="/admin" className="btn-ghost">
          ← Admin
        </Link>
      </div>
      <BrokerTable
        brokers={brokers.map((b) => ({
          id: b.id,
          name: b.name,
          domain: b.domain,
          removalMethod: b.removalMethod,
          status: b.status,
          source: b.source,
          caRegistered: b.caRegistered,
        }))}
      />
    </div>
  );
}
