import type { Fingerprint } from "@/lib/identity";

/**
 * CCPA/CPRA + California Delete Act deletion-request email (spec §7).
 *
 * DATA MINIMIZATION (§2.1, §7): we intentionally include only the fields a
 * broker needs to locate and verify the record — primary name, one contact
 * email, and city/state context. We do NOT dump the full fingerprint (SSN,
 * DOB, every address, relatives) into an outbound email.
 */

export type OptOutEmailInput = {
  brokerName: string;
  fingerprint: Fingerprint;
  // The address the broker should reply to for confirmation (operator's Gmail).
  replyToEmail: string;
};

function primary(list: string[]): string | undefined {
  return list.find((v) => v && v.trim().length > 0)?.trim();
}

// Best-effort "City, ST" from a free-form address, for locating the record
// without shipping the full street address.
function cityStateHint(fingerprint: Fingerprint): string | undefined {
  const addr =
    primary(fingerprint.addressesCurrent) ??
    primary(fingerprint.addressesPrior);
  if (!addr) return undefined;
  const parts = addr.split(",").map((p) => p.trim());
  if (parts.length >= 2) {
    return parts.slice(-2).join(", ").replace(/\s+\d{5}(-\d{4})?$/, "").trim();
  }
  return undefined;
}

export function buildOptOutEmail(input: OptOutEmailInput): {
  subject: string;
  text: string;
} {
  const name = primary(input.fingerprint.names) ?? "the data subject";
  const contactEmail = primary(input.fingerprint.emails);
  const location = cityStateHint(input.fingerprint);

  const subject = `Data Deletion Request under CCPA/CPRA — ${name}`;

  const locators = [
    `- Full name: ${name}`,
    location ? `- General location: ${location}` : undefined,
    contactEmail ? `- Contact email on file: ${contactEmail}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  const text = `To the Privacy / Data Protection team at ${input.brokerName},

I am a California resident exercising my rights under the California Consumer
Privacy Act (CCPA), as amended by the CPRA (Cal. Civ. Code § 1798.100 et seq.),
and, where applicable, the California Delete Act.

I request that you:
  1. DELETE all personal information you hold about me;
  2. OPT me OUT of any sale or sharing of my personal information; and
  3. Add me to your SUPPRESSION list so my information is not re-listed.

To help you locate my record (and only the minimum needed to do so):

${locators}

Please confirm receipt of this request and notify me when deletion is complete.
If you cannot verify my identity from the above, tell me exactly what
additional information you require rather than rejecting the request. If any
portion of my data is exempt (e.g., FCRA/GLBA/HIPAA-governed or public
government records), please delete the non-exempt portion and specify what was
retained and why.

Please direct all correspondence and your confirmation to: ${input.replyToEmail}

Thank you,
${name}
`;

  return { subject, text };
}
