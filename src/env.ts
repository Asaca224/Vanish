import { z } from "zod";

/**
 * Central, validated access to environment variables. Fails fast at startup if
 * a required secret is missing, so misconfiguration surfaces early rather than
 * as a confusing runtime error deep in a request.
 *
 * Client code must never import this module — everything here is server-only.
 */

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  PII_ENCRYPTION_KEY: z.string().min(1),
  PII_ENCRYPTION_KEY_PREVIOUS: z.string().optional(),

  // All optional now — the app uses a self-contained email/password + DB
  // session layer (no NextAuth / Google OAuth).
  AUTH_SECRET: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  OPERATOR_EMAIL: z.string().email(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),

  CRON_SECRET: z.string().min(1),

  // Optional dev/local login backdoor. When set, /api/dev-login accepts this
  // secret to mint a session without Google OAuth. Leave UNSET in real prod.
  DEV_LOGIN_SECRET: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  AI_ASSIST_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

// During `next build` we don't want a missing secret to abort the whole build
// for pages that never touch it, so we validate lazily and cache the result.
let cached: z.infer<typeof schema> | null = null;

// `next build` imports server modules to collect page data; some read config at
// import time (e.g. the NextAuth provider setup in src/auth.ts). The build runs
// in a separate process from the deployed runtime, so falling back to
// placeholders here keeps the build green WITHOUT weakening runtime validation —
// at request time the real env is present and validated strictly (and we never
// cache the placeholders, so a real value is still validated if it appears).
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

const BUILD_PLACEHOLDERS: Record<string, string> = {
  DATABASE_URL: "postgresql://placeholder@localhost:5432/placeholder",
  // Valid 32-byte base64 so any accidental decode wouldn't throw at build.
  PII_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  AUTH_SECRET: "build-placeholder",
  AUTH_GOOGLE_ID: "build-placeholder",
  AUTH_GOOGLE_SECRET: "build-placeholder",
  OPERATOR_EMAIL: "placeholder@example.com",
  CRON_SECRET: "build-placeholder",
  AI_ASSIST_ENABLED: "false",
};

export function env(): z.infer<typeof schema> {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (parsed.success) {
    cached = parsed.data;
    return cached;
  }
  if (isBuildPhase()) {
    // Fill missing values with placeholders; keep real values if set. If even
    // that fails (a malformed value set in the Vercel project would otherwise
    // abort the build during page-data collection), fall back to pure
    // placeholders — the build must never depend on runtime secrets.
    const merged = schema.safeParse({ ...BUILD_PLACEHOLDERS, ...process.env });
    if (merged.success) return merged.data;
    return schema.parse(BUILD_PLACEHOLDERS);
  }
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(
    `Invalid or missing environment variables: ${missing}. See .env.example.`,
  );
}
