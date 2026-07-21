import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, serverError } from "@/lib/api";
import { buildFingerprint } from "@/lib/identity";
import { listingUrl, matchedFields, scoreMatch } from "@/lib/match";

export const dynamic = "force-dynamic";

// GET /api/listings → this user's listings.
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const listings = await prisma.listing.findMany({
    where: { userId: guard.user.id },
    orderBy: [{ status: "asc" }, { matchConfidence: "desc" }],
    include: { broker: { select: { name: true, domain: true, removalMethod: true } } },
    take: 500,
  });
  return NextResponse.json({ listings });
}

/**
 * POST /api/listings → generate candidate listings (Phase 2 list-driven
 * discovery). Creates one candidate per live broker the user isn't already
 * paired with, scored by fingerprint identifiability. Nothing is auto-confirmed.
 */
export async function POST() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const attributes = await prisma.identityAttribute.findMany({
    where: { userId: guard.user.id },
  });
  if (attributes.length === 0) {
    return NextResponse.json(
      { error: "Add your identity details first so we can match you." },
      { status: 400 },
    );
  }
  const fp = buildFingerprint(attributes);

  const [liveBrokers, existing] = await Promise.all([
    prisma.broker.findMany({
      where: { status: "live", removalMethod: { in: ["web_form", "email"] } },
    }),
    prisma.listing.findMany({
      where: { userId: guard.user.id },
      select: { brokerId: true },
    }),
  ]);
  const have = new Set(existing.map((l) => l.brokerId));

  const toCreate = liveBrokers
    .filter((b) => !have.has(b.id))
    .map((b) => ({
      userId: guard.user.id,
      brokerId: b.id,
      profileUrl: listingUrl(b),
      matchedFields: matchedFields(fp),
      matchConfidence: scoreMatch(fp, b),
      status: "candidate" as const,
    }));

  try {
    const result = await prisma.listing.createMany({ data: toCreate });
    return NextResponse.json({ created: result.count });
  } catch (err) {
    return serverError(err);
  }
}
