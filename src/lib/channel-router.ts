import type { Broker, Channel, RemovalMethod } from "@prisma/client";

/**
 * Channel routing (spec §3, §4.3). Decides which channel a broker's removal
 * goes through, and — critically — whether a DROP bulk submission already
 * covers it, so we don't redundantly hit per-broker forms for the 600+ CA
 * brokers DROP handles.
 */

/**
 * DROP covers a broker when it is registered in California and its data is not
 * otherwise exempt. Exemptions (public gov records, FCRA/GLBA/HIPAA) live at
 * the data level, not the broker level, so at the broker granularity we treat
 * `caRegistered` as the derivation and track exemptions per-request instead.
 */
export function isCoveredByDrop(
  broker: Pick<Broker, "caRegistered" | "removalMethod">,
): boolean {
  if (!broker.caRegistered) return false;
  // A broker explicitly flagged manual_only isn't auto-covered even if CA-reg.
  if (broker.removalMethod === "manual_only") return false;
  return true;
}

/**
 * The channel we should USE for a given broker right now.
 *
 * - If DROP covers it, prefer DROP (single verified request, free, 600+ at
 *   once). Callers may still choose a per-broker channel when the operator
 *   wants removal faster than DROP's 90 days (§3 table, web_form row).
 * - Otherwise fall back to the broker's declared removalMethod.
 */
export function routeChannel(
  broker: Pick<Broker, "caRegistered" | "removalMethod">,
  opts: { preferSpeedOverDrop?: boolean } = {},
): Channel | "manual_only" {
  if (isCoveredByDrop(broker) && !opts.preferSpeedOverDrop) {
    return "drop";
  }
  return methodToChannel(broker.removalMethod);
}

export function methodToChannel(
  method: RemovalMethod,
): Channel | "manual_only" {
  switch (method) {
    case "drop":
      return "drop";
    case "email":
      return "email";
    case "web_form":
      return "web_form";
    case "postal":
      return "postal";
    case "manual_only":
      return "manual_only";
  }
}

/** Which channels run on the control plane (Vercel) vs need the worker (§3.5). */
export function requiresWorker(channel: Channel): boolean {
  return channel === "web_form";
}
