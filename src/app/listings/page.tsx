import { prisma } from "@/lib/prisma";
import { requireOnboarded } from "@/lib/page-auth";
import { ListingsReview } from "@/components/ListingsReview";

export const dynamic = "force-dynamic";

export default async function ListingsPage() {
  const session = await requireOnboarded();
  const rows = await prisma.listing.findMany({
    where: { userId: session.user.id },
    orderBy: [{ status: "asc" }, { matchConfidence: "desc" }],
    include: { broker: { select: { name: true, domain: true, removalMethod: true } } },
    take: 500,
  });

  const initial = rows.map((l) => ({
    id: l.id,
    profileUrl: l.profileUrl,
    matchConfidence: l.matchConfidence,
    status: l.status,
    broker: l.broker,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Found listings</h1>
        <p className="mt-1 text-sm text-muted">
          We propose live brokers where you&apos;re likely listed. Confirm the
          ones that are actually you — we never act on an unconfirmed match
          (§2.3). Confirming opens a routed removal request.
        </p>
      </div>
      <ListingsReview initial={initial} />
    </div>
  );
}
