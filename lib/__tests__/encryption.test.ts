/**
 * Unit tests for lib/encryption.ts
 *
 * Tests run against Node's built-in crypto module — no database required.
 * The ENCRYPTION_KEY env var is injected per-test using beforeEach / process.env.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";

// ─── helpers ────────────────────────────────────────────────────────────────

/** 64-char hex key (32 bytes) */
const HEX_KEY = randomBytes(32).toString("hex");

/** 44-char base64 key (32 bytes) */
const B64_KEY = randomBytes(32).toString("base64");

/** A second key used to test cross-key decryption failure */
const DIFFERENT_HEX_KEY = randomBytes(32).toString("hex");

function setKey(key: string | undefined) {
  if (key === undefined) {
    delete process.env.ENCRYPTION_KEY;
  } else {
    process.env.ENCRYPTION_KEY = key;
  }
}

// We import the module lazily inside each test so process.env changes take
// effect (vitest does not reset module cache between tests by default, but
// the module's getKey() reads process.env at call-time, not module-load-time).
async function getEncryption() {
  return await import("../encryption");
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("encryption — key loading", () => {
  let origKey: string | undefined;

  beforeEach(() => {
    origKey = process.env.ENCRYPTION_KEY;
  });

  afterEach(() => {
    setKey(origKey);
  });

  it("accepts a 64-char hex key", async () => {
    setKey(HEX_KEY);
    const { encrypt } = await getEncryption();
    expect(() => encrypt("hello")).not.toThrow();
  });

  it("accepts a 44-char base64 key", async () => {
    setKey(B64_KEY);
    const { encrypt } = await getEncryption();
    expect(() => encrypt("hello")).not.toThrow();
  });

  it("throws when ENCRYPTION_KEY is not set", async () => {
    setKey(undefined);
    const { encrypt } = await getEncryption();
    expect(() => encrypt("hello")).toThrow(/ENCRYPTION_KEY/);
  });

  it("throws when key has wrong length (too short)", async () => {
    setKey("abc123");
    const { encrypt } = await getEncryption();
    expect(() => encrypt("hello")).toThrow(/invalid length/i);
  });

  it("throws when key has wrong length (odd hex, 63 chars)", async () => {
    // 63-char string: not 64 (hex) nor 44 (base64) → invalid length error
    setKey(HEX_KEY.slice(0, 63));
    const { encrypt } = await getEncryption();
    expect(() => encrypt("hello")).toThrow(/invalid length/i);
  });

  it("throws on an all-zero key (zero hex)", async () => {
    setKey("0".repeat(64));
    const { encrypt } = await getEncryption();
    expect(() => encrypt("hello")).toThrow(/all-zero/i);
  });
});

describe("encryption — round-trip", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = HEX_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("decrypts to the original plaintext", async () => {
    const { encrypt, decrypt } = await getEncryption();
    const plaintext = "access-sandbox-abc123";
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("round-trips an empty string", async () => {
    const { encrypt, decrypt } = await getEncryption();
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("round-trips a long token with special characters", async () => {
    const { encrypt, decrypt } = await getEncryption();
    const token = "access-production-" + randomBytes(64).toString("base64url");
    expect(decrypt(encrypt(token))).toBe(token);
  });

  it("produces different ciphertexts for identical plaintexts (fresh IV each call)", async () => {
    const { encrypt } = await getEncryption();
    const ct1 = encrypt("same-plaintext");
    const ct2 = encrypt("same-plaintext");
    expect(ct1).not.toBe(ct2);
  });

  it("ciphertext has the iv:ciphertext:tag format", async () => {
    const { encrypt } = await getEncryption();
    const ct = encrypt("plaid-token");
    const parts = ct.split(":");
    expect(parts).toHaveLength(3);
    // Each part must be non-empty base64
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
      expect(() => Buffer.from(part, "base64")).not.toThrow();
    }
  });
});

describe("encryption — round-trip with base64 key", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = B64_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("decrypts to the original plaintext using a base64 key", async () => {
    const { encrypt, decrypt } = await getEncryption();
    const plaintext = "access-sandbox-base64key";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });
});

describe("encryption — tamper detection", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = HEX_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("throws when ciphertext is truncated (missing segments)", async () => {
    const { decrypt } = await getEncryption();
    expect(() => decrypt("onlyone")).toThrow();
    expect(() => decrypt("two:segments")).toThrow();
  });

  it("throws when the auth tag has been altered", async () => {
    const { encrypt, decrypt } = await getEncryption();
    const ct = encrypt("sensitive-token");
    const parts = ct.split(":");
    // Flip the first character of the auth tag — position 0 always encodes
    // 6 meaningful bits (never a padding character), so this reliably changes
    // the decoded bytes.
    const firstChar = parts[2][0];
    const alteredChar = firstChar === "A" ? "B" : "A";
    parts[2] = alteredChar + parts[2].slice(1);
    expect(() => decrypt(parts.join(":"))).toThrow(/Decryption failed/);
  });

  it("throws when ciphertext body has been altered", async () => {
    const { encrypt, decrypt } = await getEncryption();
    const ct = encrypt("sensitive-token");
    const parts = ct.split(":");
    // Replace body with garbage of the same base64 length
    const garbageBody = Buffer.alloc(Buffer.from(parts[1], "base64").length, 0xff).toString(
      "base64"
    );
    parts[1] = garbageBody;
    expect(() => decrypt(parts.join(":"))).toThrow(/Decryption failed/);
  });

  it("throws when decrypting with the wrong key", async () => {
    const { encrypt } = await getEncryption();
    const ct = encrypt("sensitive-token");

    // Switch to a different key for decryption
    process.env.ENCRYPTION_KEY = DIFFERENT_HEX_KEY;
    const { decrypt } = await getEncryption();
    expect(() => decrypt(ct)).toThrow(/Decryption failed/);
  });
});
