import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/page-auth";
import { AccountSettings } from "@/components/AccountSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      role: true,
      residencyState: true,
      confirmationSource: true,
      forwardingToken: true,
      authorizationSignedAt: true,
      consentVersion: true,
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="card space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Email</span>
          <span>{user?.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Role</span>
          <span>{user?.role}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Residency</span>
          <span>{user?.residencyState ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Authorization signed</span>
          <span>
            {user?.authorizationSignedAt
              ? `${user.authorizationSignedAt.toISOString().slice(0, 10)} (v${user.consentVersion})`
              : "not signed"}
          </span>
        </div>
      </div>

      <AccountSettings
        confirmationSource={user?.confirmationSource ?? "none"}
        forwardingToken={user?.forwardingToken ?? null}
      />
    </div>
  );
}
