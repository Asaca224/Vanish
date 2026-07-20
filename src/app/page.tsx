import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Root router: send users to the right place based on auth + onboarding state.
export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { authorizationSignedAt: true },
  });
  if (!user?.authorizationSignedAt) redirect("/onboarding");
  redirect("/dashboard");
}
