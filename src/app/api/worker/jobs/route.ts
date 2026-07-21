import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { workerAuthorized } from "@/lib/worker-auth";
import { buildFingerprint } from "@/lib/identity";
import { transition } from "@/lib/state-machine";

export const dynamic = "force-dynamic";

/**
 * GET /api/worker/jobs — the worker claims the next queued job (spec §7).
 * Atomically locks it to in_progress and returns the broker + the MINIMUM
 * fingerprint fields needed to act (§2.1 data minimization): primary name, one
 * city/state, one email. The full fingerprint never leaves the control plane.
 */
function cityState(addresses: string[]): string | undefined {
  const addr = addresses.find(Boolean);
  if (!addr) return undefined;
  const parts = addr.split(",").map((p) => p.trim());
  return parts.length >= 2
    ? parts.slice(-2).join(", ").replace(/\s+\d{5}(-\d{4})?$/, "").trim()
    : undefined;
}

export async function GET(request: Request) {
  if (!workerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId =
    new URL(request.url).searchParams.get("workerId") ?? "worker";

  // Claim atomically: pick the oldest queued job, lock it if still queued.
  const candidate = await prisma.workerJob.findFirst({
    where: { state: "queued" },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return NextResponse.json({ job: null });

  const locked = await prisma.workerJob.updateMany({
    where: { id: candidate.id, state: "queued" },
    data: {
      state: "in_progress",
      lockedBy: workerId,
      lockedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  if (locked.count === 0) return NextResponse.json({ job: null }); // lost the race

  const payload = candidate.payload as { removalRequestId?: string };
  const removalRequestId = payload.removalRequestId;
  if (!removalRequestId) {
    return NextResponse.json({ job: { id: candidate.id, type: candidate.type } });
  }

  const req = await prisma.removalRequest.findUnique({
    where: { id: removalRequestId },
    include: { broker: true },
  });
  if (!req) {
    await prisma.workerJob.update({
      where: { id: candidate.id },
      data: { state: "failed", result: { error: "request gone" } },
    });
    return NextResponse.json({ job: null });
  }

  // Move the request in_progress so the dashboard reflects active work.
  if (req.state === "queued" || req.state === "discovered") {
    if (req.state === "discovered") {
      await transition(prisma, req, "queued", { note: "picked up by worker" });
    }
    const q = await prisma.removalRequest.findUniqueOrThrow({ where: { id: req.id } });
    await transition(prisma, q, "in_progress", { note: `worker ${workerId}` });
  }

  const attributes = await prisma.identityAttribute.findMany({
    where: { userId: req.userId },
  });
  const fp = buildFingerprint(attributes);

  return NextResponse.json({
    job: {
      id: candidate.id,
      type: candidate.type,
      removalRequestId,
      broker: {
        name: req.broker.name,
        domain: req.broker.domain,
        optOutUrl: req.broker.optOutUrl,
        adapterKey: req.broker.adapterKey,
        requiresCaptcha: req.broker.requiresCaptcha,
        requiresId: req.broker.requiresId,
      },
      // Minimal fields only.
      fingerprint: {
        name: fp.names[0] ?? null,
        cityState: cityState([...fp.addressesCurrent, ...fp.addressesPrior]) ?? null,
        email: fp.emails[0] ?? null,
      },
    },
  });
}
