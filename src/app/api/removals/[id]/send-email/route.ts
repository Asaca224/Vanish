import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireUser, serverError } from "@/lib/api";
import { buildFingerprint } from "@/lib/identity";
import { buildOptOutEmail } from "@/lib/email-templates";
import { resendConfigured, sendOptOutEmail } from "@/lib/resend";
import { transition } from "@/lib/state-machine";

export const dynamic = "force-dynamic";

/**
 * POST /api/removals/:id/send-email — send the drafted CCPA opt-out email for an
 * email-channel request via Resend, then advance the request. Operator/user
 * approval required in the body (§2.3). Scoped to the signed-in user.
 * GET returns the draft for review.
 */

async function loadRequest(id: string, userId: string) {
  const req = await prisma.removalRequest.findFirst({
    where: { id, userId },
    include: { broker: true },
  });
  if (!req) return null;
  const [user, attributes] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.identityAttribute.findMany({ where: { userId } }),
  ]);
  return { req, user, attributes };
}

// Reply-to for confirmations: the user's confirmation source, else their email.
function replyToFor(userEmail: string | null | undefined): string {
  return userEmail ?? "no-reply@example.com";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const loaded = await loadRequest(id, guard.user.id);
  if (!loaded) return badRequest("Removal request not found");
  if (loaded.req.channel !== "email") {
    return badRequest("This request is not an email-channel request.");
  }

  const draft = buildOptOutEmail({
    brokerName: loaded.req.broker.name,
    fingerprint: buildFingerprint(loaded.attributes),
    replyToEmail: replyToFor(loaded.user?.email),
  });
  return NextResponse.json({ to: loaded.req.broker.optOutEmail, ...draft });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if ((body as { approved?: unknown })?.approved !== true) {
    return badRequest('User approval required: send { "approved": true }.');
  }

  const loaded = await loadRequest(id, guard.user.id);
  if (!loaded) return badRequest("Removal request not found");
  const { req, user, attributes } = loaded;
  if (req.channel !== "email") {
    return badRequest("This request is not an email-channel request.");
  }
  if (!req.broker.optOutEmail) {
    return badRequest(`Broker "${req.broker.name}" has no opt-out email on file.`);
  }
  if (!resendConfigured()) {
    return badRequest("Resend is not configured (RESEND_API_KEY / RESEND_FROM).");
  }

  const draft = buildOptOutEmail({
    brokerName: req.broker.name,
    fingerprint: buildFingerprint(attributes),
    replyToEmail: replyToFor(user?.email),
  });

  try {
    if (req.state === "discovered") {
      await transition(prisma, req, "queued", { note: "email opt-out approved" });
    }
    const queued = await prisma.removalRequest.findUniqueOrThrow({ where: { id: req.id } });
    await transition(prisma, queued, "in_progress");

    const sent = await sendOptOutEmail({
      to: req.broker.optOutEmail,
      replyTo: replyToFor(user?.email),
      subject: draft.subject,
      text: draft.text,
    });

    const inProgress = await prisma.removalRequest.findUniqueOrThrow({ where: { id: req.id } });
    const submitted = await transition(prisma, inProgress, "submitted", {
      note: `Sent via Resend (id ${sent.id})`,
    });
    await prisma.evidence.create({
      data: { removalRequestId: req.id, kind: "email_ref", blobRef: `resend:${sent.id}` },
    });

    let final = submitted;
    if (req.confirmationRequired) {
      final = await transition(prisma, submitted, "awaiting_confirmation", {
        note: "Awaiting broker confirmation email",
      });
    }
    return NextResponse.json({ request: final, resendId: sent.id });
  } catch (err) {
    const current = await prisma.removalRequest.findUnique({ where: { id } });
    if (current && current.state === "in_progress") {
      await transition(prisma, current, "failed", {
        failureReason: err instanceof Error ? err.message : "send failed",
      }).catch(() => undefined);
    }
    return serverError(err);
  }
}
