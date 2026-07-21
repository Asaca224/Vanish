import type { Broker } from "@prisma/client";
import type { Fingerprint } from "@/lib/identity";

/**
 * Match/confidence scoring (spec §2.3, §6, Phase 2). Without the browser worker
 * we can't scrape a specific profile, so discovery here is list-driven: we
 * propose the live brokers where the subject is *likely* listed and let the user
 * confirm each one ("this is me / not me"). Confidence reflects how
 * IDENTIFIABLE the fingerprint is — a fuller fingerprint means a match found on
 * a broker is more certainly the subject and less likely a namesake.
 *
 * Conservative posture (§2.3): scores are capped below certainty and nothing is
 * auto-confirmed — the user always reviews.
 */

export function fingerprintCompleteness(fp: Fingerprint): number {
  let score = 0;
  if (fp.names.length > 0) score += 0.4; // name is the base search key
  if (fp.addressesCurrent.length > 0) score += 0.2;
  if (fp.addressesPrior.length > 0) score += 0.05;
  if (fp.phones.length > 0) score += 0.15;
  if (fp.emails.length > 0) score += 0.1;
  if (fp.dob.length > 0) score += 0.05;
  if (fp.relatives.length > 0) score += 0.05;
  return Math.min(score, 1);
}

/**
 * Per-broker match confidence. People-search brokers that list rich profiles
 * (relatives, addresses) let a full fingerprint disambiguate strongly; brokers
 * with thin data get a small penalty. Capped at 0.9 — never certainty (§13:
 * prefer false negatives over removing a namesake).
 */
export function scoreMatch(
  fp: Fingerprint,
  broker: Pick<Broker, "removalMethod">,
): number {
  const base = 0.35 + fingerprintCompleteness(fp) * 0.55; // 0.35–0.90
  // web-form people-search sites are the classic namesake risk — slightly lower.
  const adjust = broker.removalMethod === "web_form" ? -0.05 : 0;
  return Math.max(0.3, Math.min(0.9, base + adjust));
}

// Best-effort link where the user can verify/act on the listing.
export function listingUrl(broker: Pick<Broker, "optOutUrl" | "domain">): string {
  return broker.optOutUrl ?? `https://${broker.domain}`;
}

// Which matched fields we can claim to have (for the matchedFields json).
export function matchedFields(fp: Fingerprint): Record<string, boolean> {
  return {
    name: fp.names.length > 0,
    address: fp.addressesCurrent.length > 0 || fp.addressesPrior.length > 0,
    phone: fp.phones.length > 0,
    email: fp.emails.length > 0,
    dob: fp.dob.length > 0,
    relatives: fp.relatives.length > 0,
  };
}
