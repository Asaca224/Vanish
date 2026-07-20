import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Diagnostic health check. Intentionally does NOT use the throwing env() and
 * does NOT require auth, so it still works when configuration is incomplete —
 * that's exactly when you need it. It reports only booleans and counts, never
 * secret values.
 *
 * GET /api/health → { ok, env: {VAR: bool}, encryption: {...}, db: {...} }
 */
export const dynamic = "force-dynamic";

const REQUIRED = [
  "DATABASE_URL",
  "DIRECT_URL",
  "PII_ENCRYPTION_KEY",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "OPERATOR_EMAIL",
  "CRON_SECRET",
] as const;

const OPTIONAL = ["RESEND_API_KEY", "RESEND_FROM"] as const;

export async function GET() {
  // 1. Which env vars are present (boolean only — never echo the value).
  const env: Record<string, boolean> = {};
  for (const k of [...REQUIRED, ...OPTIONAL]) env[k] = Boolean(process.env[k]);
  const missingRequired = REQUIRED.filter((k) => !process.env[k]);

  // 2. Encryption key sanity: must decode to exactly 32 bytes.
  let encryption: { ok: boolean; reason?: string } = { ok: false };
  const rawKey = process.env.PII_ENCRYPTION_KEY;
  if (!rawKey) {
    encryption = { ok: false, reason: "PII_ENCRYPTION_KEY not set" };
  } else {
    const len = Buffer.from(rawKey, "base64").length;
    encryption =
      len === 32
        ? { ok: true }
        : { ok: false, reason: `key decodes to ${len} bytes, expected 32` };
  }

  // 3. DB connectivity + whether the schema/tables exist.
  let db: {
    ok: boolean;
    error?: string;
    counts?: Record<string, number>;
  } = { ok: false };
  try {
    const [brokers, subjects, requests] = await Promise.all([
      prisma.broker.count(),
      prisma.subject.count(),
      prisma.removalRequest.count(),
    ]);
    db = { ok: true, counts: { brokers, subjects, requests } };
  } catch (err) {
    // Surface a short, non-sensitive reason (e.g. "table does not exist",
    // "Can't reach database server", auth failure).
    const message = err instanceof Error ? err.message : String(err);
    db = { ok: false, error: message.replace(/\s+/g, " ").slice(0, 300) };
  }

  // 4. Deployment metadata — so a stale deployment vs an env-scope problem is
  // unambiguous. If env vars look missing but this commit/time is fresh, the
  // vars aren't enabled for THIS environment (VERCEL_ENV); if the deployment is
  // old, the vars were added after it was built and it just needs a redeploy.
  const deployment = {
    vercelEnv: process.env.VERCEL_ENV ?? "local", // production | preview | development
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    region: process.env.VERCEL_REGION ?? null,
    builtAt: process.env.VERCEL_DEPLOYMENT_ID ? new Date().toISOString() : null,
    // Bumped whenever this route changes, so you can confirm you're hitting the
    // newest deploy and not a cached/old one.
    healthVersion: "2",
  };

  let scopeHint: string | undefined;
  if (missingRequired.length > 0) {
    scopeHint =
      `Env vars are NOT present in the '${deployment.vercelEnv}' runtime. In Vercel → ` +
      `Settings → Environment Variables, make sure each missing var is enabled for the ` +
      `'${deployment.vercelEnv}' environment, then REDEPLOY (env changes never apply to ` +
      `already-built deployments).`;
  }

  const ok = missingRequired.length === 0 && encryption.ok && db.ok;
  return NextResponse.json(
    {
      ok,
      missingRequired,
      env,
      encryption,
      db,
      deployment,
      hint: ok
        ? "All checks passed."
        : (scopeHint ??
          "DB not reachable — check DATABASE_URL and that init.sql ran, then redeploy."),
    },
    { status: ok ? 200 : 503 },
  );
}
