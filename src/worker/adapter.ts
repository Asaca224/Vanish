import type { Fingerprint } from "@/lib/identity";

/**
 * Broker adapter interface (spec §6). Adapters run in the SEPARATE WORKER, not
 * on Vercel — a Vercel function cannot host the interactive, human-in-the-loop
 * browser session the opt-out model requires (§3.5). This file defines only the
 * shared contract; concrete adapters live in src/worker/adapters/ and are
 * loaded by the worker (Phase 3), keyed by Broker.adapterKey.
 *
 * `Page` is deliberately typed loosely here so the control plane can import
 * these types without pulling in Playwright. The worker narrows it to
 * playwright's Page.
 */

export type Page = unknown;

export type CandidateListing = {
  profileUrl: string;
  matchedFields: Record<string, unknown>;
  matchConfidence: number; // 0–1
};

export type EvidenceCapture = {
  kind: "screenshot" | "email_ref" | "request_id" | "pdf";
  blobRef: string; // encrypted ref, prefer object storage (§2.1)
};

export type RemovalOutcome =
  | {
      status: "submitted";
      needsEmailConfirmation: boolean;
      evidence: EvidenceCapture[];
    }
  | {
      status: "needs_human";
      reason: "captcha" | "id_upload" | "ambiguous";
      resumeToken: string;
    }
  | { status: "exempt"; reason: string }
  | { status: "failed"; reason: string };

export type ExecutionContext = {
  // Minimal fields the adapter is allowed to use (§7 data minimization).
  fingerprint: Fingerprint;
  // Opaque token to resume a run after a human clears a challenge.
  resumeToken?: string;
};

export type ListingRef = {
  id: string;
  profileUrl: string | null;
};

export interface BrokerAdapter {
  key: string; // matches Broker.adapterKey
  version: string; // bump when the site changes
  discover(page: Page, fingerprint: Fingerprint): Promise<CandidateListing[]>;
  submitRemoval(
    page: Page,
    listing: ListingRef,
    ctx: ExecutionContext,
  ): Promise<RemovalOutcome>;
}
