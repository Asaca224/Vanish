import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Server-side page guards (Node runtime — Prisma-bound auth isn't Edge-safe).
 * Redirect unauthenticated visitors to /login and non-admins away from admin.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session;
}

export async function requireAdminSession() {
  const session = await requireSession();
  if (session.user.role !== "admin") redirect("/dashboard");
  return session;
}

/**
 * Require a signed-in user who has completed the §2.2 authorization. Sends
 * unauthorized users to /onboarding. Returns the session.
 */
export async function requireOnboarded() {
  const session = await requireSession();
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { authorizationSignedAt: true },
  });
  if (!user?.authorizationSignedAt) redirect("/onboarding");
  return session;
}
