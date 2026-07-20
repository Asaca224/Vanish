import { NextResponse } from "next/server";
import type { Prisma, RemovalMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOperator } from "@/lib/api";

// GET /api/brokers?method=&caRegistered=&q= → the target catalog.
export async function GET(request: Request) {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  const where: Prisma.BrokerWhereInput = {};

  const method = params.get("method");
  if (method) where.removalMethod = method as RemovalMethod;

  const caRegistered = params.get("caRegistered");
  if (caRegistered === "true") where.caRegistered = true;
  if (caRegistered === "false") where.caRegistered = false;

  const q = params.get("q");
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { domain: { contains: q, mode: "insensitive" } },
    ];
  }

  const brokers = await prisma.broker.findMany({
    where,
    orderBy: { name: "asc" },
    take: 500,
  });
  return NextResponse.json({ brokers, count: brokers.length });
}
