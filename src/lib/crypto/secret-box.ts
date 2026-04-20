/**
 * AES-256-GCM encrypt/decrypt for user-supplied secrets.
 *
 * Format (all parts base64, joined by `:`, prefixed with a version tag):
 *     v1:<iv>:<ciphertext>:<authTag>
 *
 * - `v1` is a format version so we can rotate / evolve without re-encrypting
 *   everything at once. Future readers must accept older versions.
 * - IV is 12 random bytes (GCM standard).
 * - AuthTag is 16 bytes (GCM standard).
 * - AAD is empty (we don't bind to user id because the DB row placement
 *   already provides context; caller can add AAD later if needed).
 *
 * Throws on:
 * - decrypt of an unknown version string,
 * - malformed format (wrong segment count),
 * - base64 decode error,
 * - authentication failure (tampered ciphertext, wrong master key).
 */

import * as nodeCrypto from "node:crypto";
import { getMasterKey } from "@/lib/crypto/master-key";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION = "v1";

export class SecretDecryptError extends Error {
  code = "secret_decrypt_failed" as const;
}

export function encryptSecret(plaintext: string): string {
  const key = getMasterKey();
  const iv = nodeCrypto.randomBytes(IV_LENGTH);
  const cipher = nodeCrypto.createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    ct.toString("base64"),
    tag.toString("base64"),
  ].join(":");
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4) {
    throw new SecretDecryptError(
      `malformed ciphertext: expected 4 segments, got ${parts.length}`
    );
  }
  const [version, ivB64, ctB64, tagB64] = parts;

  if (version !== VERSION) {
    throw new SecretDecryptError(`unsupported version "${version}"`);
  }

  const key = getMasterKey();
  let iv: Buffer;
  let ct: Buffer;
  let tag: Buffer;
  try {
    iv = Buffer.from(ivB64, "base64");
    ct = Buffer.from(ctB64, "base64");
    tag = Buffer.from(tagB64, "base64");
  } catch (e) {
    throw new SecretDecryptError(
      `base64 decode failed: ${(e as Error).message}`
    );
  }

  if (iv.length !== IV_LENGTH) {
    throw new SecretDecryptError(
      `invalid IV length: got ${iv.length} bytes, expected ${IV_LENGTH}`
    );
  }

  try {
    const decipher = nodeCrypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch (e) {
    throw new SecretDecryptError(
      `authentication failed: ${(e as Error).message}`
    );
  }
}
