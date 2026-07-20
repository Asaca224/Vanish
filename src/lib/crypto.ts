import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { env } from "@/env";

/**
 * App-level PII field encryption (spec §2.1).
 *
 * Every identity attribute value (and any captured evidence blob) is encrypted
 * here BEFORE it reaches Postgres. Neon's at-rest encryption does not protect
 * against app-layer compromise or provider-side access, so we hold the key in
 * Vercel env vars — never in the database.
 *
 * Scheme: AES-256-GCM with a random 96-bit IV per value and the GCM auth tag
 * stored alongside the ciphertext. Serialized as:
 *
 *     v1:<keyId>:<iv_b64>:<tag_b64>:<ciphertext_b64>
 *
 * `keyId` lets us rotate keys: new writes use the current key; reads try the
 * current key first, then the previous key during a rotation window.
 */

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

type KeyRef = { id: string; key: Buffer };

function decodeKey(raw: string): Buffer {
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "PII encryption key must be 32 bytes, base64-encoded. Generate with: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
}

// A short, stable id for a key so we know which one produced a ciphertext,
// without exposing the key itself. First 8 hex chars of HMAC-SHA256(key,"kid").
function keyId(key: Buffer): string {
  return createHmac("sha256", key).update("vanish-kid").digest("hex").slice(0, 8);
}

function currentKey(): KeyRef {
  const key = decodeKey(env().PII_ENCRYPTION_KEY);
  return { id: keyId(key), key };
}

function allKeys(): KeyRef[] {
  const keys = [currentKey()];
  const prev = env().PII_ENCRYPTION_KEY_PREVIOUS;
  if (prev && prev.trim().length > 0) {
    const key = decodeKey(prev);
    keys.push({ id: keyId(key), key });
  }
  return keys;
}

export function encrypt(plaintext: string): string {
  const { id, key } = currentKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    id,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decrypt(serialized: string): string {
  const parts = serialized.split(":");
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new Error("Malformed ciphertext");
  }
  const [, id, ivB64, tagB64, ctB64] = parts;
  const keyRef = allKeys().find((k) => k.id === id);
  if (!keyRef) {
    throw new Error(
      "No available encryption key matches this ciphertext. If you rotated " +
        "keys, set PII_ENCRYPTION_KEY_PREVIOUS to the old key.",
    );
  }
  const decipher = createDecipheriv(
    ALGO,
    keyRef.key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Deterministic blind index for de-duping / lookup WITHOUT storing plaintext.
 * HMAC-SHA256 over the normalized value, keyed by the current PII key. Two
 * equal normalized values produce the same hash; the hash does not reveal the
 * value. Used for the (subjectId, type, valueHash) uniqueness constraint.
 */
export function blindIndex(normalizedValue: string): string {
  const { key } = currentKey();
  return createHmac("sha256", key)
    .update(`blind:${normalizedValue}`)
    .digest("hex");
}
