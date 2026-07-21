export const config = {
  // Base URL of the deployed control plane, e.g. https://vanish-ten.vercel.app
  controlPlaneUrl: (process.env.CONTROL_PLANE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  ),
  // Must match WORKER_TOKEN set in the control-plane env.
  workerToken: process.env.WORKER_TOKEN ?? "",
  workerId: process.env.WORKER_ID ?? `worker-${process.pid}`,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 5000),
  // Headed by default so the operator can clear CAPTCHAs / upload IDs (§2.2).
  headless: process.env.HEADLESS === "true",
};

if (!config.workerToken) {
  console.error("WORKER_TOKEN is required (must match the control plane).");
  process.exit(1);
}
