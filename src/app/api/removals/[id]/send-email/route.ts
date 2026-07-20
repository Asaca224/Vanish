import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireOperator, serverError } from "@/lib/api";
import { env } from "@/env";
import { buildFingerprint } from "@/lib/identity";
import { buildOptOutEmail } from "@/lib/email-templates";
import { resendConfigured, sendOptOutEmail } from "@/lib/resend";
import { transition } from "@/lib/state-machine";

export const dynamic = "force-dynamic";

/**
 * POST /api/removals/:id/send-email
 *
 * Sends the drafted CCPA/Delete-Act opt-out email for an email-channel request
 * via Resend, then advances the request to submitted (or awaiting_confirmation
 * when the broker sends a confirm-this email). Operator approval is required
 * in the body (§2.2) — nothing sends without an explicit `approved: true`.
 *
 * GET returns the DRAFT so the operator can review before approving.
 */

async function loadRequest(id: string) {
  return prisma.removalRequest.findUnique({
    where: { id },
    include: { broker: true, subject: { include: { attributes: true } } },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const req = await loadRequest(id);
  if (!req) return badRequest("Removal request not found");
  if (req.channel !== "email") {
    return badRequest("This request is not an email-channel request.");
  }

  const fingerprint = buildFingerprint(req.subject.attributes);
  const draft = buildOptOutEmail({
    brokerName: req.broker.name,
    fingerprint,
    replyToEmail: env().OPERATOR_EMAIL,
  });
  return NextResponse.json({
    to: req.broker.optOutEmail,
    from: env().RESEND_FROM ?? null,
    ...draft,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if ((body as { approved?: unknown })?.approved !== true) {
    return badRequest("Operator approval required: send { \"approved\": true }.");
  }

  const req = await loadRequest(id);
  if (!req) return badRequest("Removal request not found");
  if (req.channel !== "email") {
    return badRequest("This request is not an email-channel request.");
  }
  if (!req.broker.optOutEmail) {
    return badRequest(`Broker "${req.broker.name}" has no opt-out email on file.`);
  }
  if (!resendConfigured()) {
    return badRequest("Resend is not configured (RESEND_API_KEY / RESEND_FROM).");
  }

  const fingerprint = buildFingerprint(req.subject.attributes);
  const draft = buildOptOutEmail({
    brokerName: req.broker.name,
    fingerprint,
    replyToEmail: env().OPERATOR_EMAIL,
  });

  try {
    // Move to in_progress first (queued → in_progress) so state is coherent
    // even if the send throws.
    if (req.state === "discovered") {
      await transition(prisma, req, "queued", { note: "email opt-out approved" });
    }
    const queued = await prisma.removalRequest.findUniqueOrThrow({
      where: { id: req.id },
    });
    await transition(prisma, queued, "in_progress");

    const sent = await sendOptOutEmail({
      to: req.broker.optOutEmail,
      replyTo: env().OPERATOR_EMAIL,
      subject: draft.subject,
      text: draft.text,
    });

    const inProgress = await prisma.removalRequest.findUniqueOrThrow({
      where: { id: req.id },
    });
    const submitted = await transition(prisma, inProgress, "submitted", {
      note: `Sent via Resend (id ${sent.id})`,
    });

    // Record the send as evidence (an email reference id).
    await prisma.evidence.create({
      data: {
        removalRequestId: req.id,
        kind: "email_ref",
        blobRef: `resend:${sent.id}`,
      },
    });

    // If the broker sends a confirm-this email, wait for it.
    let final = submitted;
    if (req.confirmationRequired) {
      final = await transition(prisma, submitted, "awaiting_confirmation", {
        note: "Awaiting broker confirmation email",
      });
    }

    return NextResponse.json({ request: final, resendId: sent.id });
  } catch (err) {
    // Fail soft: mark failed with a reason rather than 500-ing silently.
    const current = await prisma.removalRequest.findUnique({ where: { id } });
    if (current && current.state === "in_progress") {
      await transition(prisma, current, "failed", {
        failureReason: err instanceof Error ? err.message : "send failed",
      }).catch(() => undefined);
    }
    return serverError(err);
  }
}
