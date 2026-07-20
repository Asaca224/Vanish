import { gmail as gmailApi } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";

/**
 * Inbound confirmation reading via the Gmail API (spec §5 confirmation handler,
 * §8). We reuse the operator's Google OAuth grant (the same sign-in that
 * requests the gmail.readonly scope) so login and confirmation-reading share
 * one OAuth flow.
 *
 * This module is read-only: it finds likely broker confirmation emails so the
 * scheduler can advance requests awaiting_confirmation → confirmed. It never
 * clicks links automatically; a matched confirmation surfaces to the operator.
 */

/** Load the operator's stored Google access/refresh token from the DB. */
async function operatorGmailClient() {
  const account = await prisma.account.findFirst({
    where: { provider: "google" },
    orderBy: { id: "desc" },
  });
  if (!account?.access_token) {
    throw new Error(
      "No Google account/token on file. Sign in with Google (Gmail scope) first.",
    );
  }

  const oauth2 = new OAuth2Client(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Persist refreshed tokens so we don't re-auth every poll.
  oauth2.on("tokens", async (tokens) => {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token ?? account.access_token,
        expires_at: tokens.expiry_date
          ? Math.floor(tokens.expiry_date / 1000)
          : account.expires_at,
        ...(tokens.refresh_token
          ? { refresh_token: tokens.refresh_token }
          : {}),
      },
    });
  });

  return gmailApi({ version: "v1", auth: oauth2 });
}

export type ConfirmationHit = {
  messageId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
};

/**
 * Search the operator's inbox for a confirmation email from a broker, matching
 * on the broker's `confirmationEmailFrom` pattern (a domain or address) within
 * a recent window.
 */
export async function findConfirmationEmails(params: {
  fromPattern: string;
  sinceDaysAgo?: number;
  max?: number;
}): Promise<ConfirmationHit[]> {
  const gmail = await operatorGmailClient();
  const since = params.sinceDaysAgo ?? 30;
  const q = `from:(${params.fromPattern}) newer_than:${since}d`;

  const list = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: params.max ?? 10,
  });

  const hits: ConfirmationHit[] = [];
  for (const msg of list.data.messages ?? []) {
    if (!msg.id) continue;
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    const headers = full.data.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
      "";
    hits.push({
      messageId: msg.id,
      from: header("From"),
      subject: header("Subject"),
      snippet: full.data.snippet ?? "",
      receivedAt: full.data.internalDate
        ? new Date(Number(full.data.internalDate))
        : new Date(),
    });
  }
  return hits;
}
