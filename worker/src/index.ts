import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { chromium, type Browser } from "playwright";
import { config } from "./config.js";
import { claimJob, reportResult, type Job, type Outcome } from "./client.js";
import { adapterFor } from "./adapters/index.js";

const EVIDENCE_DIR = join(process.cwd(), "evidence");
mkdirSync(EVIDENCE_DIR, { recursive: true });

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

/**
 * Human-in-the-loop handoff (§2.2, §2.3). The browser is headed and paused; the
 * operator clears the CAPTCHA / uploads the ID / reviews and submits the form,
 * then tells us how it went. We NEVER solve challenges ourselves.
 */
async function handoff(job: Job, reason: string): Promise<Outcome> {
  console.log(`\n⏸  HUMAN NEEDED for ${job.broker?.name} — ${reason}`);
  console.log("   The browser is open. Complete the step, then choose:");
  console.log("   [s] submitted   [c] submitted + expects confirmation email");
  console.log("   [x] still blocked (leave for later)   [f] failed");
  const ans = (await rl.question("   > ")).trim().toLowerCase();
  if (ans === "s") return { status: "submitted", needsEmailConfirmation: false };
  if (ans === "c") return { status: "submitted", needsEmailConfirmation: true };
  if (ans === "f") return { status: "failed", reason: "operator marked failed" };
  return { status: "needs_human", reason };
}

async function runJob(browser: Browser, job: Job): Promise<Outcome> {
  if (job.type !== "web_form_removal") {
    return { status: "failed", reason: `unsupported job type: ${job.type}` };
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const adapter = adapterFor(job.broker?.adapterKey);
    console.log(`▶  ${job.broker?.name} via adapter "${adapter.key}"`);
    let outcome = await adapter.submitRemoval(page, job, { evidenceDir: EVIDENCE_DIR });

    // Any needs_human outcome pauses for the operator on the open page.
    if (outcome.status === "needs_human") {
      outcome = await handoff(job, outcome.reason);
    }

    // Attach the screenshot evidence path on success.
    if (outcome.status === "submitted") {
      outcome.evidence = [
        { kind: "screenshot", blobRef: `file://${join(EVIDENCE_DIR, `${job.id}.png`)}` },
      ];
    }
    return outcome;
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function main() {
  console.log(
    `Vanish worker "${config.workerId}" → ${config.controlPlaneUrl} (headless=${config.headless})`,
  );
  const browser = await chromium.launch({ headless: config.headless });

  // Graceful shutdown.
  const stop = async () => {
    console.log("\nShutting down…");
    await browser.close().catch(() => undefined);
    rl.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Poll loop.
  for (;;) {
    let job: Job | null = null;
    try {
      job = await claimJob();
    } catch (err) {
      console.error("claim error:", err instanceof Error ? err.message : err);
      await sleep(config.pollIntervalMs);
      continue;
    }

    if (!job) {
      await sleep(config.pollIntervalMs);
      continue;
    }

    try {
      const outcome = await runJob(browser, job);
      await reportResult(job.id, outcome);
      console.log(`✓ reported ${outcome.status} for job ${job.id}`);
    } catch (err) {
      console.error("job error:", err instanceof Error ? err.message : err);
      await reportResult(job.id, {
        status: "failed",
        reason: err instanceof Error ? err.message.slice(0, 200) : "error",
      }).catch(() => undefined);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
