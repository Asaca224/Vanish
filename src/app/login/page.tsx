import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Vanish</h1>
          <p className="mt-2 text-sm text-muted">
            Log in or create an account to start getting your personal
            information removed from data brokers and people-search sites.
          </p>
        </div>
        <AuthForm />
        <p className="text-center text-xs text-muted">
          You&apos;ll review and sign an authorization allowing Vanish to submit
          deletion requests on your behalf.
        </p>
      </div>
    </div>
  );
}
