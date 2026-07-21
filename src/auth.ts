/**
 * Session entry points. Vanish uses a self-contained email/password + database
 * session layer (see src/lib/session.ts) — no NextAuth, no OAuth provider.
 *
 * `auth()` returns the current session (or null); `signOut()` clears it.
 */
import { destroySession, getSession } from "@/lib/session";

export const auth = getSession;

export async function signOut(): Promise<void> {
  await destroySession();
}
