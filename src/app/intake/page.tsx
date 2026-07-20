import { prisma } from "@/lib/prisma";
import { decryptAttribute } from "@/lib/identity";
import { IntakeForm } from "@/components/IntakeForm";

export const dynamic = "force-dynamic";

export default async function IntakePage() {
  // MVP is single-subject: use the first (operator) subject if it exists.
  const subject = await prisma.subject.findFirst({
    orderBy: { createdAt: "asc" },
    include: { attributes: { orderBy: { createdAt: "asc" } } },
  });

  const attributes = subject
    ? subject.attributes.map((row) => {
        const a = decryptAttribute(row);
        return { id: a.id, type: a.type, value: a.value, verified: a.verified };
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Identity fingerprint</h1>
        <p className="mt-1 text-sm text-muted">
          The identifiers Vanish uses to find and match your listings. Stored
          field-encrypted; minimize what you enter to what brokers actually need.
        </p>
      </div>
      <IntakeForm subjectId={subject?.id ?? null} initialAttributes={attributes} />
    </div>
  );
}
