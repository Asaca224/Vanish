import { join } from "node:path";
import type { Page } from "playwright";
import type { Job, Outcome } from "../client.js";
import { detectChallenge, type BrokerAdapter, type ExecutionContext } from "./types.js";

/**
 * Generic reference adapter (spec §6, §7). A best-effort people-search opt-out
 * flow that serves as the TEMPLATE — real brokers need their own adapter keyed
 * by Broker.adapterKey, because every site's form is different.
 *
 * Non-negotiable rules encoded here:
 *   - NEVER solve a CAPTCHA/Turnstile → return needs_human (§2.3).
 *   - NEVER auto-upload an ID → return needs_human when the broker requires one.
 *   - Fail soft — return { failed } rather than throwing.
 */
export const genericAdapter: BrokerAdapter = {
  key: "generic",
  version: "0.1.0",

  async submitRemoval(page: Page, job: Job, ctx: ExecutionContext): Promise<Outcome> {
    const broker = job.broker;
    const fp = job.fingerprint;
    const url = broker?.optOutUrl ?? (broker ? `https://${broker.domain}` : null);
    if (!url) return { status: "failed", reason: "no opt-out URL" };

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // ID upload required → hand to the human, do not automate (§2.2).
      if (broker?.requiresId) {
        return {
          status: "needs_human",
          reason: "id_upload",
        };
      }

      // Challenge present → hand to the human (§2.3).
      const challenge = await detectChallenge(page);
      if (challenge) {
        return { status: "needs_human", reason: `captcha: ${challenge}` };
      }

      // Best-effort fill of an email + name field, then submit. These selectors
      // are intentionally generic; a per-site adapter should replace them.
      if (fp?.email) {
        const emailField = page.locator('input[type="email"], input[name*="email" i]').first();
        if (await emailField.count()) await emailField.fill(fp.email);
      }
      if (fp?.name) {
        const nameField = page
          .locator('input[name*="name" i]:not([name*="email" i])')
          .first();
        if (await nameField.count()) await nameField.fill(fp.name);
      }

      // Re-check for a challenge that appears on interaction.
      const lateChallenge = await detectChallenge(page);
      if (lateChallenge) {
        return { status: "needs_human", reason: `captcha: ${lateChallenge}` };
      }

      const submit = page
        .locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Opt Out")')
        .first();
      const shot = join(ctx.evidenceDir, `${job.id}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);

      if (!(await submit.count())) {
        // Couldn't find a submit control — likely a multi-step flow. Hand off.
        return { status: "needs_human", reason: "no submit control found" };
      }

      // The final irreversible submit is left to the human by default (§2.2):
      // we present the filled form and defer the click. Report needs_human so
      // the operator reviews and submits, unless a per-site adapter opts in.
      return { status: "needs_human", reason: "review + submit" };
    } catch (err) {
      return {
        status: "failed",
        reason: err instanceof Error ? err.message.slice(0, 200) : "error",
      };
    }
  },
};
