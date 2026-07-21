import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { V3_SCHEMA_SQL } from "@/lib/schema-sql";
import { isCoveredByDrop } from "@/lib/channel-router";
import type { RemovalMethod } from "@prisma/client";
import curated from "../../../../../data/curated-brokers.json";

/**
 * One-click schema bootstrap (gated). Runs the full v3 DDL against Neon FROM THE
 * APP (which can reach the DB even when local tooling / the agent sandbox can
 * not). Also seeds the curated brokers as `live`.
 *
 *   GET /api/admin/migrate?secret=<DEV_LOGIN_SECRET>[&reset=true]
 *
 * reset=true drops and recreates the public schema first (WIPES ALL DATA) — use
 * it to move a stale v1 database cleanly to v3. Without reset, statements are
 * applied idempotently (existing objects are skipped).
 *
 * Gated by DEV_LOGIN_SECRET; leave that unset in a locked-down production env.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isAlreadyExists(message: string): boolean {
  return /already exists|duplicate/i.test(message);
}

export async function GET(request: Request) {
  const secret = env().DEV_LOGIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Migration endpoint disabled (set DEV_LOGIN_SECRET to enable)." },
      { status: 404 },
    );
  }
  const url = new URL(request.url);
  if (url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Bad secret" }, { status: 401 });
  }
  const reset = url.searchParams.get("reset") === "true";

  const log: string[] = [];
  try {
    if (reset) {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
      await prisma.$executeRawUnsafe(`CREATE SCHEMA public`);
      log.push("reset: dropped + recreated public schema");
    }

    let applied = 0;
    let skipped = 0;
    for (const stmt of splitStatements(V3_SCHEMA_SQL)) {
      try {
        await prisma.$executeRawUnsafe(stmt);
        applied++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isAlreadyExists(msg)) {
          skipped++;
        } else {
          throw new Error(`Statement failed: ${stmt.slice(0, 80)}… → ${msg}`);
        }
      }
    }
    log.push(`schema: ${applied} statements applied, ${skipped} skipped`);

    // Seed curated brokers as live.
    const brokers = (curated as unknown as { brokers: BrokerSeed[] }).brokers;
    let seeded = 0;
    for (const b of brokers) {
      await prisma.broker.upsert({
        where: { domain: b.domain },
        create: {
          name: b.name,
          domain: b.domain,
          optOutUrl: b.optOutUrl ?? null,
          removalMethod: b.removalMethod as RemovalMethod,
          optOutEmail: b.optOutEmail ?? null,
          requiresCaptcha: b.requiresCaptcha ?? false,
          requiresId: b.requiresId ?? false,
          confirmationEmailFrom: b.confirmationEmailFrom ?? null,
          recheckDays: b.recheckDays ?? 30,
          caRegistered: b.caRegistered ?? false,
          coveredByDrop: isCoveredByDrop({
            caRegistered: b.caRegistered ?? false,
            removalMethod: b.removalMethod as RemovalMethod,
          }),
          adapterKey: b.adapterKey ?? null,
          status: "live",
          source: b.caRegistered ? "ca_registry" : "seed",
          notes: b.notes ?? null,
        },
        update: {},
      });
      seeded++;
    }
    log.push(`brokers: ${seeded} seeded (live)`);

    const [users, brokerCount] = await Promise.all([
      prisma.user.count(),
      prisma.broker.count(),
    ]);
    return NextResponse.json({ ok: true, log, users, brokers: brokerCount });
  } catch (err) {
    return NextResponse.json(
      { ok: false, log, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

type BrokerSeed = {
  name: string;
  domain: string;
  optOutUrl?: string | null;
  removalMethod: string;
  optOutEmail?: string | null;
  requiresCaptcha?: boolean;
  requiresId?: boolean;
  confirmationEmailFrom?: string | null;
  recheckDays?: number;
  caRegistered?: boolean;
  adapterKey?: string | null;
  notes?: string | null;
};
