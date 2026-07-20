import { env } from "@/env";

/**
 * Vercel Cron endpoints are public URLs; gate them with a shared secret so only
 * the scheduler (which sends `Authorization: Bearer $CRON_SECRET`) can trigger
 * work. Vercel automatically attaches this header to cron invocations when
 * CRON_SECRET is set in the project.
 */
export function isAuthorizedCron(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;
  const expected = `Bearer ${env().CRON_SECRET}`;
  // Constant-time-ish compare on equal lengths.
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) {
    diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
