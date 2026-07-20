import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">Vanish</h1>
          <p className="mt-2 text-sm text-muted">
            Sign in with the operator&apos;s Google account. The same grant lets
            Vanish read broker confirmation emails from your inbox.
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
          Only the configured operator email may sign in (single-tenant MVP).
        </p>
      </div>
    </div>
  );
}
