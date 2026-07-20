import type { AttributeType, IdentityAttribute } from "@prisma/client";
import { blindIndex, decrypt, encrypt } from "@/lib/crypto";
import { normalizeValue } from "@/lib/normalize";

/**
 * Convenience layer over IdentityAttribute rows: turns plaintext into the
 * encrypted + blind-indexed shape we persist, and back. Keeps every call site
 * from re-implementing the encrypt/normalize/hash dance.
 */

export type PlainAttribute = {
  type: AttributeType;
  value: string;
  isPrimary?: boolean;
  verified?: boolean;
};

export function toEncryptedRow(userId: string, attr: PlainAttribute) {
  const normalized = normalizeValue(attr.type, attr.value);
  return {
    userId,
    type: attr.type,
    valueEncrypted: encrypt(attr.value.trim()),
    valueHash: blindIndex(`${attr.type}:${normalized}`),
    isPrimary: attr.isPrimary ?? false,
    verified: attr.verified ?? false,
  };
}

export function decryptAttribute(row: IdentityAttribute): PlainAttribute & {
  id: string;
} {
  return {
    id: row.id,
    type: row.type,
    value: decrypt(row.valueEncrypted),
    verified: row.verified,
  };
}

/**
 * A subject's decrypted fingerprint, grouped for match/routing use. This is the
 * only place plaintext PII is reconstituted — keep its callers minimal (§2.1).
 */
export type Fingerprint = {
  names: string[];
  aliases: string[];
  emails: string[];
  phones: string[];
  addressesCurrent: string[];
  addressesPrior: string[];
  dob: string[];
  relatives: string[];
};

export function buildFingerprint(rows: IdentityAttribute[]): Fingerprint {
  const fp: Fingerprint = {
    names: [],
    aliases: [],
    emails: [],
    phones: [],
    addressesCurrent: [],
    addressesPrior: [],
    dob: [],
    relatives: [],
  };
  for (const row of rows) {
    const value = decrypt(row.valueEncrypted);
    switch (row.type) {
      case "name":
        fp.names.push(value);
        break;
      case "alias":
        fp.aliases.push(value);
        break;
      case "email":
        fp.emails.push(value);
        break;
      case "phone":
        fp.phones.push(value);
        break;
      case "address_current":
        fp.addressesCurrent.push(value);
        break;
      case "address_prior":
        fp.addressesPrior.push(value);
        break;
      case "dob":
        fp.dob.push(value);
        break;
      case "relative":
        fp.relatives.push(value);
        break;
    }
  }
  return fp;
}
