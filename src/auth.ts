import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

/**
 * Auth.js (NextAuth) is used only for SESSION MANAGEMENT here (database sessions
 * via the Prisma adapter) — `auth()` reads the session and `signOut()` clears
 * it. Login/signup happen through email + password (see /api/login, /api/signup,
 * src/lib/session.ts). There is no OAuth provider — the product does not require
 * Google sign-in.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [],
  callbacks: {
    // Database-session strategy: `user` is the DB row, so role + id are known.
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role?: "user" | "admin" }).role ?? "user";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
