import { Resend } from "resend";
import { env } from "@/env";

/**
 * Outbound email via Resend (spec §10). Sends from the operator's VERIFIED
 * DOMAIN, not their gmail.com address. Brokers reply to the address on record;
 * the Gmail API reads those replies (see gmail.ts).
 */

let client: Resend | null = null;

function resend(): Resend {
  const key = env().RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to send email-channel opt-outs.",
    );
  }
  client ??= new Resend(key);
  return client;
}

export function resendConfigured(): boolean {
  return Boolean(env().RESEND_API_KEY && env().RESEND_FROM);
}

export async function sendOptOutEmail(params: {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}): Promise<{ id: string }> {
  const from = env().RESEND_FROM;
  if (!from) {
    throw new Error("RESEND_FROM is not set (must be a Resend-verified domain).");
  }
  const { data, error } = await resend().emails.send({
    from,
    to: params.to,
    replyTo: params.replyTo,
    subject: params.subject,
    text: params.text,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
  return { id: data?.id ?? "" };
}
