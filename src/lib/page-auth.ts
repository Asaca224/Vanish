import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Server-side page guard (Node runtime). Replaces Edge middleware for auth:
 * the Prisma-bound Auth.js config isn't Edge-compatible, so we gate protected
 * pages here where Prisma runs. Redirects unauthenticated visitors to sign-in.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}
