import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOnboarded } from "@/lib/page-auth";
import { buildFingerprint } from "@/lib/identity";
import { buildPostalLetter } from "@/lib/postal-letter";

export const dynamic = "force-dynamic";

// Print-ready CCPA letter for a postal-channel request (spec §5).
export default async function LetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireOnboarded();
  const { id } = await params;

  const req = await prisma.removalRequest.findFirst({
    where: { id, userId: session.user.id },
    include: { broker: true },
  });
  if (!req) notFound();

  const [user, attributes] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } }),
    prisma.identityAttribute.findMany({ where: { userId: session.user.id } }),
  ]);

  const letter = buildPostalLetter({
    brokerName: req.broker.name,
    fingerprint: buildFingerprint(attributes),
    replyToEmail: user?.email ?? null,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold">Postal letter — {req.broker.name}</h1>
        <a href="#" className="btn" data-print>
          Print
        </a>
      </div>
      <p className="text-sm text-muted print:hidden">
        Print this, sign it, and mail it to {req.broker.name}
        {req.broker.optOutUrl ? " (mailing address on their opt-out page)." : "."}
        Then mark the request submitted on the Requests page.
      </p>
      <div className="rounded-md border border-edge bg-white p-8 text-black">
        <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
          {letter.body}
        </pre>
      </div>
      {/* Trigger print without a client component. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.querySelector('[data-print]')?.addEventListener('click',function(e){e.preventDefault();window.print();});`,
        }}
      />
    </div>
  );
}
