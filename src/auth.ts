import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";

/**
 * Auth.js (NextAuth) with the Google provider (spec §3, §10). Multi-user: any
 * Google account may sign up. The configured OPERATOR_EMAIL is bootstrapped as
 * the admin; everyone else is a `user`.
 *
 * Gmail read scope is requested so the (optional) Gmail confirmation path works
 * for users who connect it. The forwarding-address path (§2.2) is the default
 * that avoids the restricted scope.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: env().AUTH_GOOGLE_ID,
      clientSecret: env().AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
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
  events: {
    // Bootstrap the operator as admin on first sign-in.
    async createUser({ user }) {
      const operator = env().OPERATOR_EMAIL.toLowerCase();
      if ((user.email ?? "").toLowerCase() === operator) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: "admin" },
        });
      }
    },
  },
  pages: {
    signIn: "/login",
  },
});
