import type { Fingerprint } from "@/lib/identity";

/**
 * Print-ready CCPA/Delete-Act deletion letter for postal-channel brokers
 * (spec §5). Same data-minimization posture as the email template — only the
 * fields needed to locate the record. The operator prints and mails it.
 */
export type PostalLetterInput = {
  brokerName: string;
  fingerprint: Fingerprint;
  replyToEmail: string | null;
};

function primary(list: string[]): string | undefined {
  return list.find((v) => v && v.trim().length > 0)?.trim();
}

export function buildPostalLetter(input: PostalLetterInput): {
  date: string;
  body: string;
} {
  const name = primary(input.fingerprint.names) ?? "the data subject";
  const address =
    primary(input.fingerprint.addressesCurrent) ??
    primary(input.fingerprint.addressesPrior);
  const email = input.replyToEmail ?? primary(input.fingerprint.emails);
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const body = `${date}

${input.brokerName}
Attn: Privacy / Data Protection Officer

Re: Request to Delete Personal Information (CCPA/CPRA)

To Whom It May Concern:

I am a California resident exercising my rights under the California Consumer
Privacy Act (CCPA), as amended by the CPRA (Cal. Civ. Code § 1798.100 et seq.),
and, where applicable, the California Delete Act.

I request that you (1) delete all personal information you hold about me,
(2) opt me out of any sale or sharing of my personal information, and (3) add me
to your suppression list so my information is not re-listed.

To help you locate my record:

    Full name:  ${name}${address ? `\n    Address:    ${address}` : ""}${
    email ? `\n    Contact:    ${email}` : ""
  }

Please confirm receipt of this request and notify me when deletion is complete.
If you cannot verify my identity from the information above, please tell me
exactly what additional information you require rather than rejecting the
request. If any portion of my data is exempt (e.g., FCRA/GLBA/HIPAA-governed or
public government records), please delete the non-exempt portion and specify
what was retained and why.

Sincerely,


${name}`;

  return { date, body };
}
