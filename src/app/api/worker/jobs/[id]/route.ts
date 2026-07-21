import { NextResponse } from "next/server";
import { z } from "zod";
import type { RequestState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { workerAuthorized } from "@/lib/worker-auth";
import { transition } from "@/lib/state-machine";

export const dynamic = "force-dynamic";

const input = z.object({
  status: z.enum(["submitted", "needs_human", "exempt", "failed"]),
  needsEmailConfirmation: z.boolean().optional(),
  reason: z.string().optional(),
  resumeToken: z.string().optional(),
  evidence: z
    .array(
      z.object({
        kind: z.enum(["screenshot", "email_ref", "request_id", "pdf"]),
        blobRef: z.string(),
      }),
    )
    .optional(),
});

// Map a worker outcome to the RemovalRequest target state (spec §6, §7).
function targetState(
  status: string,
  needsEmailConfirmation?: boolean,
): RequestState {
  switch (status) {
    case "submitted":
      return needsEmailConfirmation ? "awaiting_confirmation" : "submitted";
    case "needs_human":
      return "awaiting_user";
    case "exempt":
      return "exempt";
    default:
      return "failed";
  }
}

/**
 * POST /api/worker/jobs/:id — the worker reports an outcome (spec §7). Updates
 * the WorkerJob, advances the linked RemovalRequest via the state machine, and
 * stores any captured evidence. needs_human parks the request at awaiting_user
 * for the operator to clear the CAPTCHA/ID in the worker's visible browser.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!workerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const job = await prisma.workerJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const jobState = parsed.data.status === "needs_human" ? "in_progress" : "done";
  await prisma.workerJob.update({
    where: { id },
    data: {
      state: parsed.data.status === "failed" ? "failed" : jobState,
      result: {
        status: parsed.data.status,
        reason: parsed.data.reason,
        resumeToken: parsed.data.resumeToken,
      },
    },
  });

  const removalRequestId = (job.payload as { removalRequestId?: string })
    .removalRequestId;
  if (removalRequestId) {
    const req = await prisma.removalRequest.findUnique({
      where: { id: removalRequestId },
    });
    if (req) {
      const to = targetState(parsed.data.status, parsed.data.needsEmailConfirmation);
      // Only submitted transitions may need the intermediate; the machine allows
      // in_progress → {submitted, awaiting_user, exempt, failed} directly.
      const note =
        parsed.data.reason ?? `worker: ${parsed.data.status}`;
      await transition(prisma, req, to, {
        note,
        failureReason: parsed.data.status === "failed" ? note : undefined,
        exemptReason: parsed.data.status === "exempt" ? note : undefined,
      }).catch(() => undefined);

      for (const ev of parsed.data.evidence ?? []) {
        await prisma.evidence.create({
          data: { removalRequestId, kind: ev.kind, blobRef: ev.blobRef },
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
