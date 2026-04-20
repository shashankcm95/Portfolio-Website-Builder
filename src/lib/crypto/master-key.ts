/**
 * Load and validate the AES-256-GCM master key used to encrypt user-supplied
 * secrets (BYOK API keys today; githubToken and others in the future).
 *
 * The key is read from `process.env.ENCRYPTION_KEY` and MUST be exactly 32
 * bytes (256 bits) when base64-decoded. We validate this on module import so
 * a misconfigured deployment surfaces immediately — lazy-fail would let a
 * clone appear to work and then silently reject every key save later.
 *
 * To generate a valid key:
 *   openssl rand -base64 32
 */

let cachedKey: Buffer | null = null;

/** Required length for an AES-256 key, in bytes. */
export const MASTER_KEY_LENGTH_BYTES = 32;

export class MissingMasterKeyError extends Error {
  code = "missing_master_key" as const;
  constructor() {
    super(
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` " +
        "and add it to your .env.local."
    );
  }
}

export class InvalidMasterKeyError extends Error {
  code = "invalid_master_key" as const;
  constructor(details: string) {
    super(
      `ENCRYPTION_KEY is invalid: ${details}. Expected 32 bytes base64-encoded.`
    );
  }
}

/**
 * Return the 32-byte AES-256 master key as a `Buffer`. Throws on first
 * call if the env var is missing or malformed — caller should let that
 * propagate up to boot failure.
 *
 * Cached after the first successful load.
 */
export function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) {
    throw new MissingMasterKeyError();
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, "base64");
  } catch (e) {
    throw new InvalidMasterKeyError(
      `base64 decode failed (${(e as Error).message})`
    );
  }

  if (decoded.length !== MASTER_KEY_LENGTH_BYTES) {
    throw new InvalidMasterKeyError(
      `decoded to ${decoded.length} bytes (need ${MASTER_KEY_LENGTH_BYTES})`
    );
  }

  cachedKey = decoded;
  return decoded;
}

/** For tests: reset the module-level cache so the next `getMasterKey()` re-reads env. */
export function _resetMasterKeyCacheForTests(): void {
  cachedKey = null;
}
