/**
 * Phase 6 — Share-link tokens.
 *
 * 24-char Crockford-base32 strings (120 bits of entropy, URL-safe,
 * human-readable — no ambiguous `0/O`, `1/I/L`). Generated via
 * `crypto.getRandomValues` on every platform we support (Node >= 18 +
 * Edge runtimes). `~21 octillion` keyspace makes collision retry
 * unnecessary; the `share_tokens.token` unique index is a belt-and-
 * suspenders check.
 *
 * Crockford alphabet reference: https://www.crockford.com/base32.html
 */

/**
 * Crockford's base32 alphabet. Note the deliberate omissions: no `I`,
 * `L`, `O`, `U` (visually ambiguous or profanity-avoiding).
 */
export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Token length in characters. 24 × log2(32) = 120 bits of entropy. */
export const SHARE_TOKEN_LENGTH = 24;

/** Regex that validates a well-formed token. Exported for the route matcher. */
export const SHARE_TOKEN_REGEX = new RegExp(
  `^[${CROCKFORD_ALPHABET}]{${SHARE_TOKEN_LENGTH}}$`
);

/**
 * Generate a cryptographically-random 24-char Crockford-base32 token.
 *
 * Implementation: draw 24 random bytes, map each byte's low 5 bits to
 * the alphabet. Sacrifices one bit per character (uses 5 bits out of 8
 * per draw) in exchange for a simple branchless loop with no modulo
 * bias. At 120 effective bits we have orders of magnitude more entropy
 * than we need for an internal share link.
 */
export function generateShareToken(): string {
  const bytes = new Uint8Array(SHARE_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < SHARE_TOKEN_LENGTH; i++) {
    out += CROCKFORD_ALPHABET[bytes[i] & 0x1f];
  }
  return out;
}

/**
 * Validate a share token's shape without touching the DB. Case-
 * sensitive (the alphabet is upper-case). Use this as a first-line
 * filter on the public route — cheap rejection of garbage inputs
 * before any query hits Postgres.
 */
export function isValidShareTokenShape(value: string): boolean {
  return typeof value === "string" && SHARE_TOKEN_REGEX.test(value);
}
