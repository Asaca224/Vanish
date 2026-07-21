import { resendConfigured, sendOptOutEmail } from "@/lib/resend";

/**
 * User notifications (spec §6): email the operator/user when items need their
 * attention — a CAPTCHA/ID handoff, a broker identity check, a confirmation to
 * click, or a blocked request. Sent via Resend from the verified domain.
 */

function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.AUTH_URL) return process.env.AUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

export type ActionCounts = {
  awaitingUser: number;
  awaitingConfirmation: number;
  blocked: number;
};

export function hasActionNeeded(c: ActionCounts): boolean {
  return c.awaitingUser + c.awaitingConfirmation + c.blocked > 0;
}

export async function sendActionNeededEmail(
  to: string,
  counts: ActionCounts,
): Promise<boolean> {
  if (!resendConfigured() || !to) return false;

  const lines = [
    counts.awaitingUser > 0 &&
      `• ${counts.awaitingUser} request(s) need you to clear a CAPTCHA, upload an ID, or verify your identity with a broker.`,
    counts.awaitingConfirmation > 0 &&
      `• ${counts.awaitingConfirmation} request(s) are awaiting a broker confirmation email.`,
    counts.blocked > 0 && `• ${counts.blocked} request(s) are blocked and need manual handling.`,
  ].filter(Boolean);

  const base = appUrl();
  const text = `You have items that need attention in Vanish:

${lines.join("\n")}

Open your dashboard to handle them${base ? `: ${base}/dashboard` : "."}

— Vanish`;

  await sendOptOutEmail({
    to,
    replyTo: to,
    subject: "Vanish — action needed on your removals",
    text,
  });
  return true;
}
