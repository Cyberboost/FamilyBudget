/**
 * Encrypt/decrypt Plaid access tokens at rest using AES-256-GCM.
 *
 * ENCRYPTION_KEY env var must be exactly 32 bytes, expressed as either:
 *   - A 64-character hex string   (e.g. node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
 *   - A 44-character base64 string (e.g. node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
 *
 * KEY ROTATION NOTES (future work — not required to implement):
 *   When rotating encryption keys you cannot simply swap ENCRYPTION_KEY because
 *   all existing ciphertext was encrypted with the old key.  Recommended approach:
 *   1. Introduce ENCRYPTION_KEY_NEW alongside the current ENCRYPTION_KEY.
 *   2. On decrypt, first try KEY_NEW; if the tag check fails, fall back to KEY (old).
 *   3. On every write path, always encrypt with KEY_NEW.
 *   4. Run a background migration job that re-encrypts every PlaidItem row by
 *      decrypting with the old key and writing back with the new key, then
 *      removes the old key from the environment.
 *   This "dual-key decrypt / single-key encrypt" pattern avoids downtime and
 *   ensures no data loss during the transition window.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;
const REQUIRED_KEY_BYTES = 32;

/**
 * Parse ENCRYPTION_KEY from the environment.
 * Accepts:
 *   - 64-char hex  → Buffer.from(key, 'hex')
 *   - 44-char base64 → Buffer.from(key, 'base64')
 * Throws a descriptive error without including the key value in the message.
 */
export function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  let key: Buffer;

  if (raw.length === 64) {
    // hex
    key = Buffer.from(raw, "hex");
  } else if (raw.length === 44) {
    // standard base64 (32 bytes → always 44 chars including padding)
    key = Buffer.from(raw, "base64");
  } else {
    throw new Error(
      `ENCRYPTION_KEY has an invalid length (${raw.length} chars). ` +
        "Expected a 64-character hex string or a 44-character base64 string (both encode 32 bytes)."
    );
  }

  if (key.length !== REQUIRED_KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY decoded to ${key.length} bytes but AES-256 requires exactly ${REQUIRED_KEY_BYTES} bytes. ` +
        "The string may be corrupted or encoded incorrectly."
    );
  }

  // Sanity check: key must not be all-zero (common misconfiguration)
  if (key.equals(Buffer.alloc(REQUIRED_KEY_BYTES, 0))) {
    throw new Error("ENCRYPTION_KEY must not be an all-zero value.");
  }

  return key;
}

/**
 * Returns a base64-encoded string: <iv>:<ciphertext>:<authTag>
 * Each segment is individually base64-encoded; colons serve as separators.
 */
export function encrypt(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new TypeError(`encrypt() requires a string argument, received ${typeof plaintext}`);
  }
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), encrypted.toString("base64"), authTag.toString("base64")].join(
    ":"
  );
}

/**
 * Decrypts a value previously produced by encrypt().
 * Throws if the payload is malformed or the auth tag does not match
 * (indicating tampering or a wrong key).
 */
export function decrypt(payload: string): string {
  if (typeof payload !== "string") {
    throw new TypeError("decrypt() requires a string argument");
  }
  const key = getKey();
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error(
      `Invalid encrypted payload: expected "iv:ciphertext:tag" but got ${parts.length} segment(s)`
    );
  }
  const [ivB64, encB64, tagB64] = parts;
  // IV and auth tag must never be empty; the ciphertext body may be empty
  // when the input plaintext was an empty string.
  if (!ivB64 || !tagB64) {
    throw new Error("Invalid encrypted payload: IV or auth tag segment is empty");
  }

  const iv = Buffer.from(ivB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`
    );
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    // Do not propagate internal crypto details — they may leak information
    throw new Error(
      "Decryption failed: the payload may be corrupted, tampered with, or encrypted with a different key"
    );
  }
}
