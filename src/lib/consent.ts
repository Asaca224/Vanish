/**
 * Electronic authorized-agent consent text (§2.2). Versioned so we can prove
 * exactly what each user agreed to and when. Bump CONSENT_VERSION when the text
 * changes materially.
 */
export const CONSENT_VERSION = "2026-01-01";

export const CONSENT_TEXT = `I authorize Vanish to act as my agent to prepare and submit data-deletion and
opt-out requests on my behalf to data brokers and people-search services under
the CCPA/CPRA and the California Delete Act, and to correspond with those
services to complete those requests. I understand that some services may require
me to verify my identity directly, that I can revoke this authorization at any
time, and that Vanish will not upload identity documents without my action.`;
