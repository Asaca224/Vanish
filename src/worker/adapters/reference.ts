import type {
  BrokerAdapter,
  CandidateListing,
  ExecutionContext,
  ListingRef,
  Page,
  RemovalOutcome,
} from "@/worker/adapter";
import type { Fingerprint } from "@/lib/identity";

/**
 * Reference adapter (spec §6) — the end-to-end TEMPLATE for a well-known
 * people-search site, to be fleshed out in the worker (Phase 3). It documents
 * the required shape and the human-in-the-loop rules; the Playwright calls are
 * stubbed because Playwright lives in the worker, not the control plane.
 *
 * RULES ENCODED HERE (non-negotiable, §2.2, §6):
 *   - NEVER solve or bypass a CAPTCHA. On detection, return `needs_human` with
 *     a resumeToken and let the operator clear it in the headed browser.
 *   - NEVER auto-upload an ID document. Return `needs_human` reason "id_upload".
 *   - Match conservatively (§2.4); route ambiguous matches to a human.
 *   - Fail soft: throw nothing that would crash the batch; return "failed".
 */
export const referenceAdapter: BrokerAdapter = {
  key: "reference-people-search",
  version: "0.1.0",

  async discover(
    _page: Page,
    _fingerprint: Fingerprint,
  ): Promise<CandidateListing[]> {
    // Worker implementation (Phase 3):
    //   1. Navigate the site's search with name + city/state (minimal fields).
    //   2. Parse result cards; score each against the fingerprint.
    //   3. Return candidates with 0–1 confidence; do NOT auto-confirm.
    return [];
  },

  async submitRemoval(
    _page: Page,
    _listing: ListingRef,
    _ctx: ExecutionContext,
  ): Promise<RemovalOutcome> {
    // Worker implementation (Phase 3):
    //   1. Open the opt-out form for the listing.
    //   2. If a CAPTCHA/Turnstile is present → return:
    //        { status: "needs_human", reason: "captcha", resumeToken }
    //   3. If an ID upload is demanded → return:
    //        { status: "needs_human", reason: "id_upload", resumeToken }
    //   4. On success → capture screenshot + any request id as evidence:
    //        { status: "submitted", needsEmailConfirmation, evidence }
    //   5. On unexpected failure → return { status: "failed", reason }.
    return {
      status: "failed",
      reason: "Reference adapter is a template; implement in the worker (Phase 3).",
    };
  },
};
