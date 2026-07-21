import { NextResponse } from "next/server";
import { z } from "zod";
import type { RequestState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, requireUser, serverError } from "@/lib/api";
import { transition } from "@/lib/state-machine";

export const dynamic = "force-dynamic";

const input = z.object({
  action: z.enum(["confirm", "mark_removed", "retry"]),
});

// Target state for each manual action, given the current state.
function targetFor(action: string, current: RequestState): RequestState | null {
  switch (action) {
    case "confirm":
      return current === "awaiting_confirmation" || current === "submitted"
        ? "confirmed"
        : null;
    case "mark_removed":
      if (current === "confirmed") return "removed"; // verifying is optional
      if (current === "verifying") return "removed";
      return null;
    case "retry":
      return current === "failed" || current === "blocked" ? "queued" : null;
    default:
      return null;
  }
}

/**
 * PATCH /api/removals/:id — manual lifecycle controls the user drives when they
 * see a broker's confirmation email, verify a listing is gone, or want to retry
 * a failed request. Scoped to the signed-in user; enforced by the state machine.
 */
export async function PATCH(
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
    return badRequest("Invalid JSON body");
  }
  const parsed = input.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const req = await prisma.removalRequest.findFirst({
    where: { id, userId: guard.user.id },
  });
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const to = targetFor(parsed.data.action, req.state);
  if (!to) {
    return badRequest(`Cannot ${parsed.data.action} a request in state ${req.state}.`);
  }

  try {
    // confirmed → removed goes through verifying to keep the audit trail honest.
    if (parsed.data.action === "mark_removed" && req.state === "confirmed") {
      const mid = await transition(prisma, req, "verifying", { note: "manual verify" });
      const done = await transition(prisma, mid, "removed", {
        note: "User verified the listing is gone",
      });
      return NextResponse.json({ state: done.state });
    }
    const updated = await transition(prisma, req, to, {
      note: `Manual: ${parsed.data.action}`,
    });
    return NextResponse.json({ state: updated.state });
  } catch (err) {
    return serverError(err);
  }
}
