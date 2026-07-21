import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transition } from "@/lib/state-machine";

export const dynamic = "force-dynamic";

/**
 * Inbound email webhook (spec §2.2 forwarding path). The user auto-forwards
 * broker confirmation emails to confirm+<forwardingToken>@yourdomain; a Resend
 * inbound webhook POSTs them here. We resolve the user by the token, match the
 * sender against their awaiting_confirmation requests' confirmationEmailFrom,
 * and advance the matching request(s) to confirmed.
 *
 * Gate: if RESEND_WEBHOOK_SECRET is set, require it as ?secret= or in an
 * Authorization: Bearer header.
 */

function addressPart(value: string): string {
  // "Name <a@b.com>" → "a@b.com"; also handles a bare address.
  const m = value.match(/<([^>]+)>/);
  return (m ? m[1] : value).trim().toLowerCase();
}

function extractToken(recipients: string[]): string | null {
  for (const r of recipients) {
    const addr = addressPart(r);
    const m = addr.match(/^confirm\+([a-z0-9]+)@/i);
    if (m) return m[1];
  }
  return null;
}

// Resend inbound payloads vary; pull recipients + sender from common shapes.
function parsePayload(body: any): { recipients: string[]; from: string } {
  const data = body?.data ?? body ?? {};
  const toRaw = data.to ?? data.recipient ?? data.envelope?.to ?? [];
  const recipients = (Array.isArray(toRaw) ? toRaw : [toRaw])
    .filter(Boolean)
    .map(String);
  const from = String(data.from ?? data.sender ?? data.envelope?.from ?? "");
  return { recipients, from };
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const auth = request.headers.get("authorization");
    const ok =
      url.searchParams.get("secret") === secret ||
      auth === `Bearer ${secret}`;
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { recipients, from } = parsePayload(body);
  const token = extractToken(recipients);
  if (!token) {
    // Not a confirm+ address — ack so the provider doesn't retry.
    return NextResponse.json({ ok: true, matched: 0, reason: "no confirm token" });
  }

  const user = await prisma.user.findUnique({ where: { forwardingToken: token } });
  if (!user) {
    return NextResponse.json({ ok: true, matched: 0, reason: "unknown token" });
  }

  const senderDomain = addressPart(from).split("@")[1] ?? "";
  const pending = await prisma.removalRequest.findMany({
    where: { userId: user.id, state: "awaiting_confirmation" },
    include: { broker: { select: { confirmationEmailFrom: true, domain: true } } },
  });

  let matched = 0;
  for (const req of pending) {
    const pattern = (req.broker.confirmationEmailFrom ?? req.broker.domain ?? "")
      .toLowerCase();
    if (pattern && (senderDomain.includes(pattern) || pattern.includes(senderDomain))) {
      await transition(prisma, req, "confirmed", {
        note: `Confirmation email from ${addressPart(from)} (forwarded)`,
      });
      await prisma.evidence.create({
        data: {
          removalRequestId: req.id,
          kind: "email_ref",
          blobRef: `inbound:${addressPart(from)}`,
        },
      });
      matched++;
    }
  }

  return NextResponse.json({ ok: true, matched });
}
