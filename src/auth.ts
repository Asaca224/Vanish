import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";

/**
 * Auth.js (NextAuth) with the Google provider (spec §10). The same Google
 * sign-in grants the Gmail read scope, so login and confirmation-reading share
 * one OAuth flow.
 *
 * SINGLE-TENANT (§2.1): only OPERATOR_EMAIL may sign in. A cloud DB holding PII
 * must not be openable by anyone who happens to have a Google account.
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
          // Read the inbox for broker confirmations; offline + consent so we
          // reliably receive a refresh token for background Gmail polling.
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const operator = env().OPERATOR_EMAIL.toLowerCase();
      return (user.email ?? "").toLowerCase() === operator;
    },
  },
  pages: {
    signIn: "/signin",
  },
});
