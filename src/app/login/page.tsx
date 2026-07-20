import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">Vanish</h1>
          <p className="mt-2 text-sm text-muted">
            Sign in or sign up with Google to start getting your personal
            information removed from data brokers and people-search sites.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn w-full">Continue with Google</button>
        </form>
        <p className="text-xs text-muted">
          By continuing you&apos;ll review and sign an authorization allowing
          Vanish to submit deletion requests on your behalf.
        </p>
      </div>
    </div>
  );
}
