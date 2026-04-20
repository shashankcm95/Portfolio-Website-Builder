import {
  encryptSecret,
  decryptSecret,
  SecretDecryptError,
} from "@/lib/crypto/secret-box";
import {
  _resetMasterKeyCacheForTests,
  MissingMasterKeyError,
  InvalidMasterKeyError,
  getMasterKey,
} from "@/lib/crypto/master-key";

describe("master-key loader", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey;
    _resetMasterKeyCacheForTests();
  });

  it("returns a 32-byte buffer for a valid 32-byte base64 key", () => {
    const key = getMasterKey();
    expect(key.length).toBe(32);
  });

  it("caches the key across calls", () => {
    const a = getMasterKey();
    const b = getMasterKey();
    expect(a).toBe(b);
  });

  it("throws MissingMasterKeyError when ENCRYPTION_KEY is empty", () => {
    _resetMasterKeyCacheForTests();
    process.env.ENCRYPTION_KEY = "";
    expect(() => getMasterKey()).toThrow(MissingMasterKeyError);
  });

  it("throws MissingMasterKeyError when ENCRYPTION_KEY is unset", () => {
    _resetMasterKeyCacheForTests();
    delete process.env.ENCRYPTION_KEY;
    expect(() => getMasterKey()).toThrow(MissingMasterKeyError);
  });

  it("throws InvalidMasterKeyError when the key is the wrong length", () => {
    _resetMasterKeyCacheForTests();
    // 16 null bytes base64 = "AAAAAAAAAAAAAAAAAAAAAA==" — wrong size
    process.env.ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAA==";
    expect(() => getMasterKey()).toThrow(InvalidMasterKeyError);
  });
});

describe("encryptSecret / decryptSecret — round trip", () => {
  it("encrypts and decrypts a short ASCII string", () => {
    const plain = "sk-proj-abc123";
    const ct = encryptSecret(plain);
    expect(ct).toMatch(/^v1:/);
    expect(decryptSecret(ct)).toBe(plain);
  });

  it("handles long UTF-8 strings correctly", () => {
    const plain = "🔐 a very long secret with unicode 日本語 — " + "x".repeat(500);
    const ct = encryptSecret(plain);
    expect(decryptSecret(ct)).toBe(plain);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plain = "same-secret";
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(plain);
    expect(decryptSecret(b)).toBe(plain);
  });

  it("output has exactly 4 colon-separated segments", () => {
    const ct = encryptSecret("abc");
    expect(ct.split(":")).toHaveLength(4);
  });
});

describe("decryptSecret — error paths", () => {
  it("throws on unsupported version prefix", () => {
    // Build a v2 ciphertext from a valid v1 by swapping the prefix
    const v1 = encryptSecret("x");
    const v2 = "v2" + v1.slice(2);
    expect(() => decryptSecret(v2)).toThrow(SecretDecryptError);
    expect(() => decryptSecret(v2)).toThrow(/unsupported version/);
  });

  it("throws on wrong segment count", () => {
    expect(() => decryptSecret("v1:only:three")).toThrow(SecretDecryptError);
    expect(() => decryptSecret("v1:a:b:c:extra")).toThrow(SecretDecryptError);
  });

  it("throws when the ciphertext is tampered with", () => {
    const ct = encryptSecret("secret");
    const parts = ct.split(":");
    // Flip the first byte of the ciphertext section by replacing its base64
    const ctBytes = Buffer.from(parts[2], "base64");
    ctBytes[0] = ctBytes[0] ^ 0xff;
    parts[2] = ctBytes.toString("base64");
    const tampered = parts.join(":");
    expect(() => decryptSecret(tampered)).toThrow(SecretDecryptError);
  });

  it("throws when the auth tag is tampered with", () => {
    const ct = encryptSecret("secret");
    const parts = ct.split(":");
    const tagBytes = Buffer.from(parts[3], "base64");
    tagBytes[0] = tagBytes[0] ^ 0xff;
    parts[3] = tagBytes.toString("base64");
    const tampered = parts.join(":");
    expect(() => decryptSecret(tampered)).toThrow(SecretDecryptError);
  });

  it("throws when the IV is the wrong length", () => {
    const ct = encryptSecret("secret");
    const parts = ct.split(":");
    // Replace IV with 6 bytes (wrong)
    parts[1] = Buffer.alloc(6).toString("base64");
    const malformed = parts.join(":");
    expect(() => decryptSecret(malformed)).toThrow(SecretDecryptError);
    expect(() => decryptSecret(malformed)).toThrow(/invalid IV length/i);
  });
});
