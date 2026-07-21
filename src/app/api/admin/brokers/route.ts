import { NextResponse } from "next/server";
import type { BrokerStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { upsertBrokerInput } from "@/lib/validation";
import { isCoveredByDrop } from "@/lib/channel-router";
import { normalizeDomain } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

// GET /api/admin/brokers?status=&q= → registry list.
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  const where: Prisma.BrokerWhereInput = {};
  const status = params.get("status");
  if (status) where.status = status as BrokerStatus;
  const q = params.get("q");
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { domain: { contains: q, mode: "insensitive" } },
    ];
  }
  const brokers = await prisma.broker.findMany({
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 1000,
  });
  return NextResponse.json({ brokers, count: brokers.length });
}

// POST /api/admin/brokers → create a broker manually (status defaults to live).
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = upsertBrokerInput.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const domain = normalizeDomain(parsed.data.domain);
  if (!domain) return badRequest("Invalid domain");

  try {
    const broker = await prisma.broker.create({
      data: {
        name: parsed.data.name,
        domain,
        optOutUrl: parsed.data.optOutUrl || null,
        removalMethod: parsed.data.removalMethod,
        optOutEmail: parsed.data.optOutEmail || null,
        requiresCaptcha: parsed.data.requiresCaptcha,
        requiresId: parsed.data.requiresId,
        confirmationEmailFrom: parsed.data.confirmationEmailFrom || null,
        recheckDays: parsed.data.recheckDays,
        caRegistered: parsed.data.caRegistered,
        coveredByDrop: isCoveredByDrop({
          caRegistered: parsed.data.caRegistered,
          removalMethod: parsed.data.removalMethod,
        }),
        status: parsed.data.status ?? "live",
        source: "manual",
        notes: parsed.data.notes ?? null,
      },
    });
    return NextResponse.json({ broker }, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}
