import type { PrismaClient, RemovalRequest, RequestState } from "@prisma/client";

/**
 * RemovalRequest lifecycle state machine (spec §8).
 *
 *   discovered → queued → in_progress
 *     in_progress → awaiting_user        (captcha / id_upload / ambiguous)
 *     awaiting_user → in_progress        (human cleared it)
 *     in_progress → submitted
 *     submitted → awaiting_confirmation  (broker sent a confirm-this email)
 *     awaiting_confirmation → confirmed  (Gmail confirmation handled)
 *     confirmed → verifying              (re-scan to check listing is gone)
 *     verifying → removed
 *     removed → queued                   (recheck found a RELISTING)
 *   Terminal/side: exempt, failed, blocked, skipped_covered_by_drop
 */

const TRANSITIONS: Record<RequestState, RequestState[]> = {
  discovered: ["queued", "exempt", "skipped_covered_by_drop", "blocked"],
  queued: ["in_progress", "skipped_covered_by_drop", "exempt", "failed"],
  in_progress: ["awaiting_user", "submitted", "blocked", "failed", "exempt"],
  awaiting_user: ["in_progress", "blocked", "failed"],
  submitted: ["awaiting_confirmation", "verifying", "confirmed", "failed"],
  awaiting_confirmation: ["confirmed", "failed", "blocked"],
  confirmed: ["verifying", "removed"],
  verifying: ["removed", "failed"],
  removed: ["queued"], // relisting re-queues
  // terminal / side states
  exempt: [],
  failed: ["queued"], // allow manual retry
  blocked: ["queued", "in_progress"], // after manual handling
  skipped_covered_by_drop: ["queued"], // if DROP window blows past, re-route
};

export function canTransition(from: RequestState, to: RequestState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(from: RequestState, to: RequestState) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/**
 * Apply a transition and record a RequestEvent audit row, atomically. Set
 * timestamp side-effects (submittedAt, confirmedAt, ...) based on the target
 * state so callers don't forget them.
 */
export async function transition(
  prisma: PrismaClient,
  request: Pick<RemovalRequest, "id" | "state">,
  to: RequestState,
  opts: { note?: string; failureReason?: string; exemptReason?: string } = {},
): Promise<RemovalRequest> {
  const from = request.state;
  if (from === to) {
    // Idempotent no-op is allowed (e.g. cron re-processing), but don't log it.
    return prisma.removalRequest.findUniqueOrThrow({ where: { id: request.id } });
  }
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }

  const now = new Date();
  const data: Record<string, unknown> = { state: to };
  if (to === "submitted") data.submittedAt = now;
  if (to === "confirmed") data.confirmedAt = now;
  if (to === "removed") data.verifiedRemovedAt = now;
  if (opts.failureReason) data.failureReason = opts.failureReason;
  if (opts.exemptReason) data.exemptReason = opts.exemptReason;

  const [updated] = await prisma.$transaction([
    prisma.removalRequest.update({ where: { id: request.id }, data }),
    prisma.requestEvent.create({
      data: {
        removalRequestId: request.id,
        fromState: from,
        toState: to,
        note: opts.note ?? opts.failureReason ?? opts.exemptReason ?? null,
      },
    }),
  ]);
  return updated;
}
