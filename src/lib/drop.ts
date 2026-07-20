/**
 * California DROP (Delete Request and Opt-out Platform) helpers (spec §3).
 *
 * DROP is ASSISTED, not automated: the operator submits on the authenticated
 * DROP site themselves; Vanish records one ChannelSubmission covering all
 * CA-registered brokers and tracks the regulatory windows.
 *
 * Windows (verify current values against privacy.ca.gov at build time):
 *   - Brokers must RETRIEVE requests at least every 45 days.
 *   - Brokers must FINALIZE deletion within 90 days.
 */

export const DROP_RETRIEVE_DAYS = 45;
export const DROP_FINALIZE_DAYS = 90;
export const DROP_CONSUMER_URL = "https://privacy.ca.gov/drop/";

export function dropWindows(submittedAt: Date): {
  retrieveByAt: Date;
  finalizeByAt: Date;
} {
  return {
    retrieveByAt: addDays(submittedAt, DROP_RETRIEVE_DAYS),
    finalizeByAt: addDays(submittedAt, DROP_FINALIZE_DAYS),
  };
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Days remaining until a window closes; negative means overdue. */
export function daysUntil(target: Date, now: Date = new Date()): number {
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
