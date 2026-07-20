import Link from "next/link";
import { requireSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { decryptAttribute } from "@/lib/identity";
import { ConsentForm } from "@/components/ConsentForm";
import { IntakeForm } from "@/components/IntakeForm";
import { CONSENT_TEXT, CONSENT_VERSION } from "@/lib/consent";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { authorizationSignedAt: true },
  });

  // Step 1: authorization not yet signed → capture consent.
  if (!user?.authorizationSignedAt) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Account setup</h1>
          <p className="mt-1 text-sm text-muted">
            First, authorize Vanish to submit deletion requests on your behalf.
          </p>
        </div>
        <ConsentForm consentText={CONSENT_TEXT} consentVersion={CONSENT_VERSION} />
      </div>
    );
  }

  // Step 2: authorized → collect the identity fingerprint.
  const rows = await prisma.identityAttribute.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  const attributes = rows.map((r) => {
    const a = decryptAttribute(r);
    return { id: a.id, type: a.type, value: a.value, verified: a.verified };
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your identity fingerprint</h1>
          <p className="mt-1 text-sm text-muted">
            The identifiers we search for. Field-encrypted; add only what brokers
            need to find you.
          </p>
        </div>
        <Link href="/dashboard" className="btn">
          Done →
        </Link>
      </div>
      <IntakeForm initialAttributes={attributes} />
    </div>
  );
}
