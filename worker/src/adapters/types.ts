import type { Page } from "playwright";
import type { Job, Outcome } from "../client.js";

export type ExecutionContext = {
  // Directory to write evidence (screenshots) into.
  evidenceDir: string;
};

export interface BrokerAdapter {
  key: string; // matches Broker.adapterKey; "generic" is the fallback
  version: string;
  submitRemoval(page: Page, job: Job, ctx: ExecutionContext): Promise<Outcome>;
}

// Detect the common bot-challenge widgets. NEVER solve them (§2.3) — we hand off
// to the human. Returns a short label if a challenge is present.
export async function detectChallenge(page: Page): Promise<string | null> {
  const selectors: [string, string][] = [
    ['iframe[src*="recaptcha"]', "reCAPTCHA"],
    ['iframe[src*="hcaptcha"]', "hCaptcha"],
    ['iframe[src*="turnstile"]', "Cloudflare Turnstile"],
    ['div.g-recaptcha', "reCAPTCHA"],
    ['[class*="captcha" i]', "CAPTCHA"],
  ];
  for (const [sel, label] of selectors) {
    if (await page.locator(sel).first().count().catch(() => 0)) return label;
  }
  return null;
}
