/**
 * The browser-automation worker (spec §7) authenticates to the control-plane
 * job API with a bearer token (WORKER_TOKEN). It runs off-Vercel (the operator's
 * machine or a hosted browser service) and pulls jobs over HTTPS.
 */
export function workerAuthorized(request: Request): boolean {
  const token = process.env.WORKER_TOKEN;
  if (!token) return false; // worker API disabled unless a token is set
  return request.headers.get("authorization") === `Bearer ${token}`;
}
