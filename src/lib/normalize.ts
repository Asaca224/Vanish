import type { AttributeType } from "@prisma/client";

/**
 * Normalization used both for the blind index (so equal values de-dupe) and to
 * clean operator input. Kept conservative — we never want normalization to
 * merge two genuinely different identifiers.
 */
export function normalizeValue(type: AttributeType, raw: string): string {
  const value = raw.trim();
  switch (type) {
    case "email":
      return value.toLowerCase();
    case "phone":
      // Keep digits only; drop a leading US country code for consistency.
      return value.replace(/\D+/g, "").replace(/^1(\d{10})$/, "$1");
    case "name":
    case "alias":
    case "relative":
      return value.replace(/\s+/g, " ").toLowerCase();
    case "address_current":
    case "address_prior":
      return value.replace(/\s+/g, " ").replace(/[.,]/g, "").toLowerCase();
    case "dob":
      return value; // validated separately; kept as entered (YYYY or YYYY-MM-DD)
    default:
      return value;
  }
}
