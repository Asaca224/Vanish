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

  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  OPERATOR_EMAIL: z.string().email(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),

  CRON_SECRET: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().optional(),
  AI_ASSIST_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

// During `next build` we don't want a missing secret to abort the whole build
// for pages that never touch it, so we validate lazily and cache the result.
let cached: z.infer<typeof schema> | null = null;

export function env(): z.infer<typeof schema> {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => i.path.join("."))
      .join(", ");
    throw new Error(
      `Invalid or missing environment variables: ${missing}. See .env.example.`,
    );
  }
  cached = parsed.data;
  return cached;
}
